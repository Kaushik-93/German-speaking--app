import Anthropic from "@anthropic-ai/sdk";
import { Scenario } from "./content";
import { currentPhase, state } from "./store";

export interface Correction {
  said: string;
  better: string;
  note: string;
}
export interface Chunk {
  de: string;
  en: string;
}
export interface TutorTurn {
  reply: string;
  reply_en: string;
  corrections: Correction[];
  suggestions: Chunk[];
  useful: Chunk[];
}
export interface Feedback {
  summary: string;
  strengths: string[];
  fixes: Correction[];
  practice: Chunk[];
}

export interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

const chunk = {
  type: "object",
  properties: { de: { type: "string" }, en: { type: "string" } },
  required: ["de", "en"],
  additionalProperties: false,
};
const correction = {
  type: "object",
  properties: { said: { type: "string" }, better: { type: "string" }, note: { type: "string" } },
  required: ["said", "better", "note"],
  additionalProperties: false,
};

const TURN_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Your spoken reply in German." },
    reply_en: { type: "string", description: "English translation of reply." },
    corrections: { type: "array", items: correction },
    suggestions: { type: "array", items: chunk },
    useful: { type: "array", items: chunk },
  },
  required: ["reply", "reply_en", "corrections", "suggestions", "useful"],
  additionalProperties: false,
};

const FEEDBACK_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    fixes: { type: "array", items: correction },
    practice: { type: "array", items: chunk },
  },
  required: ["summary", "strengths", "fixes", "practice"],
  additionalProperties: false,
};

function systemPrompt(sc: Scenario): string {
  const { phase } = currentPhase();
  const name = state.settings.name ? `The learner's name is ${state.settings.name}. ` : "";
  return `You are a warm, patient German conversation partner inside a speaking-practice app. ${name}The learner's only goal is to SPEAK German fluently and naturally by the end of March — not exams or grammar levels. Everything they say comes from speech recognition, so ignore capitalisation, punctuation and small transcription glitches; never correct those.

Scenario: ${sc.setup}
Current training phase: "${phase.name}" — ${phase.focus}

How to talk:
- Stay in character and keep the conversation flowing like a real person. Reply in natural, spoken, everyday German (the way people really talk in Germany, including words like "also", "na ja", "echt", "genau").
- Keep replies SHORT: 1–3 sentences, then usually ask one simple follow-up question so the learner speaks more than you.
- Match the learner's level: if they struggle, use simpler words and shorter sentences; if they do well, gradually raise the level.
- If they write English or mix in English words, don't switch to English — answer in German and give them the German for what they meant in "corrections".
- If a message starts with "[HELP]", the learner is stuck: give a very simple reply, and make "suggestions" especially easy.
- Never lecture about grammar in "reply". Corrections go only in "corrections".

Fields:
- reply: what you say next, in German.
- reply_en: an English translation of reply.
- corrections: only real mistakes in the learner's LAST message that a native would notice (wrong word, word order, gender/case that sounds wrong, unnatural phrasing). At most 2. "said" = their phrase, "better" = how a native would say it, "note" = a 3–10 word English explanation. Empty array if it was fine.
- suggestions: 3 short, natural German answers the learner could say next to your reply, from easy to slightly harder, each with English.
- useful: 0–1 natural, reusable spoken chunk from this exchange worth memorising (not trivial words), with English.`;
}

function client(): Anthropic {
  if (!state.settings.apiKey) throw new Error("Add your Claude API key in Settings to talk with the AI partner.");
  return new Anthropic({ apiKey: state.settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

async function ask<T>(system: string, messages: { role: "user" | "assistant"; content: string }[], schema: object, maxTokens: number): Promise<T> {
  const res = await client().beta.messages.create({
    model: state.settings.model,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    output_config: { effort: "low", format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    messages,
  });
  if (res.stop_reason === "refusal") throw new Error("The AI declined that message. Try saying it another way.");
  if (res.stop_reason === "max_tokens") throw new Error("The reply was cut off. Please try again.");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Got an unexpected reply from the AI. Please try again.");
  }
}

/** History is stored as plain text; assistant turns are the German replies only. */
function toApi(history: ChatMsg[]) {
  const msgs = history.map((m) => ({ role: m.role, content: m.text }));
  // The API needs the conversation to start with a user turn.
  if (msgs[0]?.role === "assistant") msgs.unshift({ role: "user", content: "(Start the conversation.)" });
  return msgs;
}

export async function tutorTurn(sc: Scenario, history: ChatMsg[]): Promise<TutorTurn> {
  const t = await ask<TutorTurn>(systemPrompt(sc), toApi(history), TURN_SCHEMA, 3000);
  return {
    reply: t.reply ?? "",
    reply_en: t.reply_en ?? "",
    corrections: t.corrections ?? [],
    suggestions: t.suggestions ?? [],
    useful: t.useful ?? [],
  };
}

export async function conversationFeedback(sc: Scenario, history: ChatMsg[]): Promise<Feedback> {
  const transcript = history.map((m) => `${m.role === "user" ? "Learner" : "Partner"}: ${m.text}`).join("\n");
  const system = `You are an encouraging German speaking coach. The learner wants to speak fluently and naturally (not exam levels). Their text comes from speech recognition, so ignore punctuation/capitalisation. Give short, motivating, practical feedback in English. Fields: summary (2 sentences, encouraging, honest), strengths (2–3 short bullets), fixes (the 3 most useful corrections from the learner's lines: said / better / short note), practice (4–6 natural German spoken chunks they should memorise next, based on what they tried to say, with English).`;
  return ask<Feedback>(system, [{ role: "user", content: `Scenario: ${sc.title}\n\nTranscript:\n${transcript}` }], FEEDBACK_SCHEMA, 3000);
}

export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Your API key was rejected. Check it in Settings.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to that model. Try another model in Settings.";
  if (e instanceof Anthropic.RateLimitError) return "Too many requests right now — wait a few seconds and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "No connection to the AI. Check your internet.";
  if (e instanceof Anthropic.APIError) return `AI error (${e.status ?? "?"}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
