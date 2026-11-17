import "./style.css";
import { MONOLOGUES, Phrase, SCENARIOS, Scenario, TOPICS, topicOf } from "./content";
import { canListen, compare, germanVoices, isListening, listen, speak, stopListening, stopSpeaking } from "./speech";
import {
  PHASES,
  addDays,
  addMinutes,
  allPhrases,
  countSpoken,
  currentPhase,
  dayLog,
  daysLeft,
  dueCards,
  exportJSON,
  grade,
  learnedCount,
  newCards,
  replaceState,
  resetAll,
  save,
  savePhrase,
  state,
  streak,
  today,
  State,
} from "./store";
import { ChatMsg, conversationFeedback, describeError, tutorTurn, TutorTurn } from "./tutor";
import { clear, h, modal, ring, toast } from "./ui";

const app = document.getElementById("app")!;
type Tab = "today" | "talk" | "phrases" | "progress";
let tab: Tab = "today";
let cleanup: (() => void) | null = null;

// ---------- Practice time tracking ----------
// Counts time only while a practice screen is open, visible, and the learner was active recently.
let practicing = false;
let lastActive = Date.now();
["pointerdown", "keydown"].forEach((ev) => addEventListener(ev, () => (lastActive = Date.now()), { passive: true }));
export function markActive() {
  lastActive = Date.now();
}
setInterval(() => {
  if (practicing && document.visibilityState === "visible" && (Date.now() - lastActive < 90_000 || isListening())) {
    addMinutes(0.25);
    const m = document.getElementById("live-min");
    if (m) m.textContent = String(Math.floor(dayLog().minutes));
  }
}, 15_000);

// ---------- Shell ----------

function setScreen(node: Node, opts: { practice?: boolean; tabs?: boolean } = {}) {
  cleanup?.();
  cleanup = null;
  stopListening();
  stopSpeaking();
  practicing = !!opts.practice;
  clear(app);
  app.append(node);
  if (opts.tabs !== false) app.append(tabBar());
  window.scrollTo(0, 0);
}

function tabBar(): HTMLElement {
  const item = (t: Tab, icon: string, label: string) =>
    h("button", { class: "tab" + (tab === t ? " active" : ""), onclick: () => go(t) }, h("span", { class: "tab-ico" }, icon), h("span", null, label));
  return h("nav", { class: "tabbar" }, item("today", "🏠", "Today"), item("talk", "🗣️", "Talk"), item("phrases", "📚", "Phrases"), item("progress", "📈", "Progress"));
}

function go(t: Tab) {
  tab = t;
  if (t === "today") renderToday();
  else if (t === "talk") renderTalkPicker();
  else if (t === "phrases") renderPhrases();
  else renderProgress();
}

function topBar(title: string, onBack?: () => void, right?: Node): HTMLElement {
  return h(
    "header",
    { class: "topbar" },
    onBack ? h("button", { class: "icon-btn", "aria-label": "Back", onclick: onBack }, "←") : h("span", { class: "spacer" }),
    h("h1", null, title),
    right ?? h("span", { class: "spacer" }),
  );
}

// ---------- Today ----------

function todayScenario(): Scenario {
  const { phase } = currentPhase();
  const n = Math.floor(Date.now() / 86400000);
  const key = phase.scenarios[n % phase.scenarios.length];
  return SCENARIOS.find((s) => s.key === key) ?? SCENARIOS[0];
}

function greeting(): string {
  const hr = new Date().getHours();
  const g = hr < 11 ? "Guten Morgen" : hr < 18 ? "Hallo" : "Guten Abend";
  return state.settings.name ? `${g}, ${state.settings.name}!` : `${g}!`;
}

function renderToday() {
  tab = "today";
  const log = dayLog();
  const goal = state.settings.dailyMinutes;
  const { phase, index } = currentPhase();
  const due = dueCards().length;
  const fresh = Math.min(state.settings.newPerDay, newCards(state.settings.newPerDay).length);
  const sc = todayScenario();
  const s = streak();

  const screen = h(
    "main",
    { class: "screen" },
    h(
      "header",
      { class: "hero" },
      h("div", null, h("p", { class: "eyebrow" }, greeting()), h("h1", { class: "hero-title" }, `${daysLeft()} days to fluent`)),
      h("button", { class: "icon-btn", "aria-label": "Settings", onclick: renderSettings }, "⚙️"),
    ),
    h(
      "section",
      { class: "card stats-card" },
      ring(log.minutes / goal, `${Math.floor(log.minutes)}/${goal}`, "min today"),
      h(
        "div",
        { class: "stat-col" },
        h("div", { class: "stat" }, h("strong", null, `🔥 ${s}`), h("span", null, s === 1 ? "day streak" : "day streak")),
        h("div", { class: "stat" }, h("strong", null, `🗣️ ${log.spoken}`), h("span", null, "sentences spoken today")),
        h("div", { class: "stat" }, h("strong", null, `📚 ${learnedCount()}`), h("span", null, "phrases in your mouth")),
      ),
    ),
    h(
      "button",
      { class: "big-cta" + (log.done ? " done" : ""), onclick: startSession },
      h("span", { class: "cta-title" }, log.done ? "✅ Session done — go again?" : "▶ Start today's session"),
      h("span", { class: "cta-sub" }, `Warm-up · ${due + fresh} phrases · talk: ${sc.emoji} ${sc.title}`),
    ),
    h(
      "section",
      { class: "card phase-card" },
      h("p", { class: "eyebrow" }, `Phase ${index + 1} of ${PHASES.length}`),
      h("h2", null, phase.name),
      h("p", { class: "muted" }, phase.focus),
      h("div", { class: "phase-bar" }, ...PHASES.map((_, i) => h("span", { class: i < index ? "past" : i === index ? "now" : "" }))),
    ),
    h("h3", { class: "section-title" }, "Quick practice"),
    h(
      "div",
      { class: "grid2" },
      quick("🗣️", "Talk with AI", "Real conversation", () => go("talk")),
      quick("🎯", "Speak drill", `${due} due · ${fresh} new`, () => runDrill(buildDrillQueue(), () => renderToday())),
      quick("🎧", "Shadowing", "Listen & repeat", () => runShadow(shadowSet(8), () => renderToday())),
      quick("⏱️", "Speak 60 sec", "Talk non-stop", () => runMonologue(() => renderToday())),
    ),
    !canListen()
      ? h("p", { class: "warn" }, "⚠️ This browser can't do speech recognition. Use Chrome (Android) or Safari (iPhone) for the full experience — you can still type.")
      : null,
  );
  setScreen(screen);
}

function quick(icon: string, title: string, sub: string, onclick: () => void) {
  return h("button", { class: "card quick", onclick }, h("span", { class: "quick-ico" }, icon), h("strong", null, title), h("span", { class: "muted small" }, sub));
}

// ---------- Daily session: warm-up → drill → talk → done ----------

function startSession() {
  const done = () => {
    dayLog().done = true;
    save();
    renderSessionDone();
  };
  const talk = () => {
    const sc = todayScenario();
    if (state.settings.apiKey) runChat(sc, done, { step: "Step 3 of 3 · Talk", minTurns: 6 });
    else runMonologue(done, "Step 3 of 3 · Speak freely");
  };
  const drill = () => {
    const q = buildDrillQueue();
    if (q.length) runDrill(q, talk, "Step 2 of 3 · Speak");
    else talk();
  };
  runShadow(shadowSet(5), drill, "Step 1 of 3 · Warm-up");
}

function renderSessionDone() {
  const log = dayLog();
  const screen = h(
    "main",
    { class: "screen center" },
    h("div", { class: "celebrate" }, "🎉"),
    h("h1", null, "Super gemacht!"),
    h("p", { class: "muted" }, `You spoke ${log.spoken} sentences and practised ${Math.floor(log.minutes)} minutes today.`),
    h("p", { class: "big-num" }, `🔥 ${streak()} day streak`),
    h("p", { class: "muted" }, `${daysLeft()} days left until your goal. Every day counts — see you tomorrow!`),
    h("button", { class: "btn primary wide", onclick: () => go("talk") }, "Keep talking 🗣️"),
    h("button", { class: "btn wide", onclick: renderToday }, "Back home"),
  );
  setScreen(screen);
}

function buildDrillQueue(): { p: Phrase; isNew: boolean }[] {
  const due = dueCards().slice(0, 25).map((p) => ({ p, isNew: false }));
  const fresh = newCards(state.settings.newPerDay).map((p) => ({ p, isNew: true }));
  // Interleave new phrases among reviews.
  const out: { p: Phrase; isNew: boolean }[] = [];
  while (due.length || fresh.length) {
    if (fresh.length) out.push(fresh.shift()!);
    if (due.length) out.push(due.shift()!);
    if (due.length) out.push(due.shift()!);
  }
  return out;
}

function shadowSet(n: number): Phrase[] {
  // Recent phrases + flow/rescue phrases: what you most need on autopilot.
  const seen = allPhrases().filter((p) => state.cards[p.id]);
  const pool = seen.length >= n ? seen : [...seen, ...allPhrases().filter((p) => p.topic === "rescue" || p.topic === "flow")];
  const shuffled = [...new Map(pool.map((p) => [p.id, p])).values()].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ---------- Mic button helper ----------

interface MicHandle {
  el: HTMLButtonElement;
  start: () => void;
}

function micButton(opts: { onResult: (t: string) => void; onInterim?: (t: string) => void; continuous?: boolean; lang?: string; label?: string; autoStopMs?: number }): MicHandle {
  const btn = h("button", { class: "mic", "aria-label": "Speak" }, h("span", { class: "mic-ico" }, "🎤"), h("span", { class: "mic-label" }, opts.label ?? "Tap & speak")) as HTMLButtonElement;
  let silence: number | undefined;
  const setLabel = (t: string) => ((btn.querySelector(".mic-label") as HTMLElement).textContent = t);
  const start = async () => {
    if (isListening()) {
      stopListening();
      return;
    }
    markActive();
    btn.classList.add("live");
    setLabel(opts.continuous ? "Listening… tap to send" : "Listening…");
    try {
      const text = await listen({
        continuous: opts.continuous,
        lang: opts.lang,
        onInterim: (t) => {
          opts.onInterim?.(t);
          if (opts.autoStopMs) {
            clearTimeout(silence);
            silence = window.setTimeout(() => stopListening(), opts.autoStopMs);
          }
        },
      });
      clearTimeout(silence);
      btn.classList.remove("live");
      setLabel(opts.label ?? "Tap & speak");
      markActive();
      opts.onResult(text);
    } catch (e) {
      btn.classList.remove("live");
      setLabel(opts.label ?? "Tap & speak");
      toast(describeError(e));
    }
  };
  btn.addEventListener("click", start);
  return { el: btn, start };
}

function scoreBadge(score: number): HTMLElement {
  const [cls, txt] = score >= 0.85 ? ["good", "Perfekt! 🎯"] : score >= 0.6 ? ["ok", "Fast! Almost 👍"] : ["bad", "Try again 💪"];
  return h("div", { class: `score ${cls}` }, txt, h("span", null, ` ${Math.round(score * 100)}%`));
}

function wordDiff(target: string, said: string): HTMLElement {
  const { words } = compare(target, said);
  return h("p", { class: "diff" }, ...words.map((w) => h("span", { class: w.ok ? "hit" : "miss" }, w.word + " ")));
}

function playBtn(text: string, label = "🔊", rate?: number) {
  return h("button", { class: "icon-btn play", "aria-label": "Play", onclick: () => speak(text, rate) }, label);
}

function progressDots(i: number, n: number) {
  return h("div", { class: "progress" }, h("div", { class: "progress-fill", style: `width:${Math.round((i / Math.max(1, n)) * 100)}%` }));
}

// ---------- Shadowing ----------

function runShadow(items: Phrase[], onDone: () => void, step?: string) {
  let i = 0;
  const show = () => {
    if (i >= items.length) return onDone();
    const p = items[i];
    const result = h("div", { class: "result" });
    const live = h("p", { class: "live-text" });
    let tries = 0;
    const next = () => {
      i++;
      show();
    };
    const mic = micButton({
      label: "Repeat it",
      onInterim: (t) => (live.textContent = t),
      onResult: (said) => {
        clear(result);
        if (!said) {
          live.textContent = "Didn't catch that — tap the mic and try again.";
          return;
        }
        countSpoken();
        tries++;
        const { score } = compare(p.de, said);
        result.append(scoreBadge(score), wordDiff(p.de, said));
        if (score >= 0.85 && state.settings.handsFree) setTimeout(() => i === items.indexOf(p) && next(), 1400);
        else if (tries < 3 && state.settings.handsFree) setTimeout(() => speak(p.de).then(() => mic.start()), 900);
      },
    });
    const screen = h(
      "main",
      { class: "screen drill" },
      topBar(step ?? "Shadowing", () => onDone(), h("span", { class: "pill" }, `${i + 1}/${items.length}`)),
      progressDots(i, items.length),
      h("p", { class: "eyebrow center-text" }, "🎧 Listen, then say it exactly like that — copy the melody"),
      h("div", { class: "card phrase-card" }, h("p", { class: "de big" }, p.de), h("p", { class: "en" }, p.en), p.tip ? h("p", { class: "tip" }, "💡 " + p.tip) : null),
      h("div", { class: "row center" }, playBtn(p.de, "🔊 Normal"), playBtn(p.de, "🐢 Slow", 0.65)),
      live,
      result,
      h("div", { class: "mic-row" }, mic.el),
      h("button", { class: "btn ghost wide", onclick: next }, i + 1 < items.length ? "Next →" : "Continue →"),
    );
    setScreen(screen, { practice: true, tabs: false });
    speak(p.de).then(() => state.settings.handsFree && canListen() && mic.start());
  };
  show();
}

// ---------- Speak drill (English → say it in German) ----------

function runDrill(queue: { p: Phrase; isNew: boolean }[], onDone: () => void, step?: string) {
  if (!queue.length) {
    toast("Nothing due right now — you're all caught up! 🎉");
    return onDone();
  }
  let i = 0;
  const total = queue.length;
  const show = () => {
    if (i >= queue.length) return onDone();
    const { p, isNew } = queue[i];
    const topic = topicOf(p.topic);
    const answer = h("div", { class: "answer hidden" });
    const live = h("p", { class: "live-text" });
    const result = h("div", { class: "result" });
    const grades = h("div", { class: "grades hidden" });
    let suggested: 0 | 1 | 2 = 1;

    const reveal = (said?: string) => {
      answer.classList.remove("hidden");
      clear(answer);
      answer.append(h("p", { class: "de big" }, p.de, " ", playBtn(p.de)), p.tip ? h("p", { class: "tip" }, "💡 " + p.tip) : "");
      clear(result);
      if (said !== undefined) {
        const { score } = compare(p.de, said);
        suggested = score >= 0.9 ? 2 : score >= 0.6 ? 1 : 0;
        result.append(scoreBadge(score), wordDiff(p.de, said));
      } else suggested = 0;
      speak(p.de);
      showGrades();
    };
    const doGrade = (g: 0 | 1 | 2) => {
      grade(p.id, g);
      if (g === 0) queue.push({ p, isNew: false }); // see it again this session
      i++;
      show();
    };
    const showGrades = () => {
      grades.classList.remove("hidden");
      clear(grades);
      const b = (g: 0 | 1 | 2, label: string, cls: string) => h("button", { class: `btn ${cls}` + (g === suggested ? " suggested" : ""), onclick: () => doGrade(g) }, label);
      grades.append(b(0, "Again", "bad"), b(1, "Good", "ok"), b(2, "Easy", "good"));
    };

    const mic = micButton({
      label: isNew ? "Repeat it" : "Say it in German",
      onInterim: (t) => (live.textContent = t),
      onResult: (said) => {
        if (!said) {
          live.textContent = "Didn't catch that — try again.";
          return;
        }
        countSpoken();
        live.textContent = `You said: “${said}”`;
        reveal(said);
      },
    });

    const prompt = isNew
      ? h("div", { class: "card phrase-card" }, h("span", { class: "pill new" }, "NEW"), h("p", { class: "de big" }, p.de), h("p", { class: "en" }, p.en), p.tip ? h("p", { class: "tip" }, "💡 " + p.tip) : null)
      : h(
          "div",
          { class: "card phrase-card" },
          h("p", { class: "eyebrow" }, `${topic?.emoji ?? "⭐"} How do you say…`),
          h("p", { class: "en big" }, p.en),
          h("button", { class: "btn ghost small", onclick: (e: Event) => ((e.target as HTMLElement).textContent = "💡 " + p.de.split(" ").slice(0, 2).join(" ") + " …") }, "Hint"),
        );

    const screen = h(
      "main",
      { class: "screen drill" },
      topBar(step ?? "Speak drill", () => onDone(), h("span", { class: "pill" }, `${Math.min(i + 1, total)}/${total}`)),
      progressDots(i, queue.length),
      prompt,
      isNew ? h("div", { class: "row center" }, playBtn(p.de, "🔊 Normal"), playBtn(p.de, "🐢 Slow", 0.65)) : null,
      live,
      isNew ? null : answer,
      result,
      h("div", { class: "mic-row" }, mic.el),
      isNew ? null : h("button", { class: "btn ghost wide", onclick: () => reveal() }, "Show answer"),
      grades,
      isNew ? h("button", { class: "btn primary wide", onclick: () => doGrade(1) }, "Got it →") : null,
    );
    setScreen(screen, { practice: true, tabs: false });
    if (isNew) speak(p.de).then(() => state.settings.handsFree && canListen() && mic.start());
    else if (state.settings.handsFree && canListen()) setTimeout(() => mic.start(), 400);
  };
  show();
}

// ---------- Speak 60 seconds ----------

function runMonologue(onDone: () => void, step?: string) {
  const prompt = MONOLOGUES[Math.floor(Math.random() * MONOLOGUES.length)];
  let secs = 60;
  let timer: number | undefined;
  let transcript = "";
  const clock = h("div", { class: "clock" }, "1:00");
  const live = h("p", { class: "live-text tall" }, "Tap the mic and talk for one minute. Don't stop — use fillers (also, na ja, ähm) when you need time to think.");
  const after = h("div", { class: "after" });
  const tick = () => {
    secs--;
    clock.textContent = `0:${String(Math.max(0, secs)).padStart(2, "0")}`;
    if (secs <= 0) stopListening();
  };
  const mic = micButton({
    continuous: true,
    label: "Start talking",
    onInterim: (t) => {
      live.textContent = t;
      if (!timer) timer = window.setInterval(tick, 1000);
    },
    onResult: (t) => {
      clearInterval(timer);
      timer = undefined;
      transcript = (transcript + " " + t).trim();
      live.textContent = transcript || "Nothing heard — try again.";
      if (!transcript) return;
      const words = transcript.split(/\s+/).length;
      for (let k = 0; k < Math.max(1, Math.round(words / 8)); k++) countSpoken();
      clear(after);
      after.append(
        h("p", { class: "score good" }, `🗣️ ${words} words spoken`),
        state.settings.apiKey ? h("button", { class: "btn primary wide", onclick: () => getFeedback() }, "Get AI feedback ✨") : "",
        h("button", { class: "btn wide", onclick: onDone }, "Done →"),
      );
    },
  });
  cleanup = () => clearInterval(timer);
  const getFeedback = async () => {
    const sc: Scenario = { key: "mono", title: `Monologue: ${prompt}`, emoji: "⏱️", setup: "", opener: "" };
    showFeedback(sc, [{ role: "user", text: transcript }], onDone);
  };
  const screen = h(
    "main",
    { class: "screen drill" },
    topBar(step ?? "Speak 60 seconds", () => onDone()),
    h("div", { class: "card phrase-card" }, h("p", { class: "eyebrow" }, "⏱️ Your topic"), h("p", { class: "de big" }, prompt), h("button", { class: "btn ghost small", onclick: () => speak(prompt) }, "🔊 Listen")),
    clock,
    live,
    h("div", { class: "mic-row" }, mic.el),
    after,
    h("button", { class: "btn ghost wide", onclick: onDone }, "Skip →"),
  );
  setScreen(screen, { practice: true, tabs: false });
}

// ---------- Talk: scenario picker ----------

function renderTalkPicker() {
  tab = "talk";
  const sc = todayScenario();
  const screen = h(
    "main",
    { class: "screen" },
    topBar("Talk"),
    !state.settings.apiKey
      ? h(
          "div",
          { class: "card warn-card" },
          h("p", null, "🔑 The AI conversation partner needs a Claude API key. It's stored only on this phone."),
          h("button", { class: "btn primary", onclick: renderSettings }, "Add API key"),
          h("p", { class: "muted small" }, "No key? “Speak 60 sec”, drills and shadowing all work offline."),
        )
      : null,
    h("button", { class: "big-cta", onclick: () => runChat(sc, renderTalkPicker) }, h("span", { class: "cta-title" }, `${sc.emoji} Today: ${sc.title}`), h("span", { class: "cta-sub" }, "Recommended for your current phase")),
    h("h3", { class: "section-title" }, "All situations"),
    h("div", { class: "grid2" }, ...SCENARIOS.map((s) => quick(s.emoji, s.title, "", () => runChat(s, renderTalkPicker)))),
    h("h3", { class: "section-title" }, "Without AI"),
    h("div", { class: "grid2" }, quick("⏱️", "Speak 60 sec", "Monologue challenge", () => runMonologue(renderTalkPicker))),
  );
  setScreen(screen);
}

// ---------- Talk: conversation ----------

function runChat(sc: Scenario, onExit: () => void, opts: { step?: string; minTurns?: number } = {}) {
  if (!state.settings.apiKey) {
    toast("Add your Claude API key in Settings first.");
    renderSettings();
    return;
  }
  const history: ChatMsg[] = [{ role: "assistant", text: sc.opener }];
  let lastTurn: TutorTurn | null = null;
  let busy = false;
  let userTurns = 0;

  const log = h("div", { class: "chat" });
  const live = h("p", { class: "live-text chat-live" });
  const help = h("div", { class: "help hidden" });
  const typed = h("input", { class: "text-in", placeholder: "…or type here", enterkeyhint: "send" }) as HTMLInputElement;

  const scroll = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));

  const aiBubble = (text: string, en: string) => {
    const enEl = h("p", { class: "bubble-en" + (state.settings.showTranslation ? "" : " hidden") }, en);
    const b = h(
      "div",
      { class: "bubble ai" },
      h("p", null, text),
      enEl,
      h(
        "div",
        { class: "bubble-tools" },
        playBtn(text),
        playBtn(text, "🐢", 0.65),
        en ? h("button", { class: "icon-btn", onclick: () => enEl.classList.toggle("hidden") }, "🇬🇧") : null,
      ),
    );
    log.append(b);
    scroll();
  };
  const userBubble = (text: string) => {
    const b = h("div", { class: "bubble me" }, h("p", null, text));
    log.append(b);
    scroll();
    return b;
  };
  const thinking = () => {
    const t = h("div", { class: "bubble ai typing" }, h("span"), h("span"), h("span"));
    log.append(t);
    scroll();
    return t;
  };

  const renderHelp = () => {
    clear(help);
    const sug = lastTurn?.suggestions ?? [];
    help.append(
      h("p", { class: "eyebrow" }, "You could say… (tap to hear, then say it)"),
      ...sug.map((s) => h("button", { class: "chip", onclick: () => speak(s.de) }, h("strong", null, s.de), h("span", null, s.en))),
      sug.length ? "" : h("p", { class: "muted small" }, "Try: “Wie sagt man … auf Deutsch?” or tap the EN mic and say it in English."),
    );
  };

  const send = async (text: string, isHelp = false) => {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    help.classList.add("hidden");
    live.textContent = "";
    const bubble = userBubble(isHelp ? `🇬🇧 ${text}` : text);
    if (!isHelp) {
      countSpoken();
      userTurns++;
    }
    history.push({ role: "user", text: isHelp ? `[HELP] I don't know how to say this in German: "${text}". Show me in corrections/suggestions, then continue.` : text });
    const t = thinking();
    try {
      const turn = await tutorTurn(sc, history);
      t.remove();
      lastTurn = turn;
      for (const c of turn.corrections) {
        bubble.append(h("div", { class: "fix" }, h("span", { class: "fix-better" }, "✏️ " + c.better), " ", playBtn(c.better), h("span", { class: "fix-note" }, c.note)));
      }
      for (const u of turn.useful) {
        if (savePhrase(u.de, u.en)) toast(`⭐ Saved to your phrases: ${u.de}`);
      }
      history.push({ role: "assistant", text: turn.reply });
      aiBubble(turn.reply, turn.reply_en);
      renderHelp();
      busy = false;
      await speak(turn.reply);
      if (state.settings.handsFree && canListen() && document.body.contains(mic.el) && !isListening()) mic.start();
    } catch (e) {
      t.remove();
      history.pop();
      busy = false;
      bubble.append(h("div", { class: "fix err" }, "⚠️ " + describeError(e), " ", h("button", { class: "btn ghost small", onclick: () => { bubble.remove(); send(text, isHelp); } }, "Retry")));
    }
  };

  const mic = micButton({
    continuous: true,
    autoStopMs: 2600,
    onInterim: (t) => (live.textContent = t),
    onResult: (t) => (t ? send(t) : (live.textContent = "Didn't catch that — tap the mic and try again.")),
  });
  const enMic = micButton({
    lang: "en-US",
    label: "Say it in English",
    onInterim: (t) => (live.textContent = "🇬🇧 " + t),
    onResult: (t) => t && send(t, true),
  });
  enMic.el.classList.add("mic-small");

  const finish = () => {
    if (userTurns === 0) return onExit();
    showFeedback(sc, history, onExit);
  };

  const screen = h(
    "main",
    { class: "screen chat-screen" },
    topBar(opts.step ?? `${sc.emoji} ${sc.title}`, () => (userTurns ? finish() : onExit()), h("button", { class: "btn small primary", onclick: finish }, "Finish")),
    log,
    h(
      "div",
      { class: "chat-dock" },
      live,
      help,
      h(
        "div",
        { class: "dock-row" },
        h("button", { class: "btn stuck", onclick: () => { renderHelp(); help.classList.toggle("hidden"); scroll(); } }, "🆘 Stuck?"),
        mic.el,
        enMic.el,
      ),
      h(
        "form",
        { class: "type-row", onsubmit: (e: Event) => { e.preventDefault(); const v = typed.value; typed.value = ""; send(v); } },
        typed,
        h("button", { class: "btn small", type: "submit" }, "Send"),
      ),
    ),
  );
  setScreen(screen, { practice: true, tabs: false });
  aiBubble(sc.opener, "");
  speak(sc.opener).then(() => state.settings.handsFree && canListen() && mic.start());
  if (opts.minTurns) toast(`Try to answer at least ${opts.minTurns} times, then tap Finish.`);
}

function showFeedback(sc: Scenario, history: ChatMsg[], onExit: () => void) {
  stopListening();
  stopSpeaking();
  const body = h("div", { class: "feedback" }, h("h2", null, "Your feedback"), h("div", { class: "bubble ai typing" }, h("span"), h("span"), h("span")));
  modal(body, onExit);
  conversationFeedback(sc, history)
    .then((f) => {
      clear(body);
      let saved = 0;
      for (const p of f.practice) if (savePhrase(p.de, p.en)) saved++;
      body.append(
        h("h2", null, "Gut gemacht! 👏"),
        h("p", null, f.summary),
        h("h3", null, "💪 What went well"),
        h("ul", null, ...f.strengths.map((s) => h("li", null, s))),
        f.fixes.length ? h("h3", null, "✏️ Say it like a native") : "",
        ...f.fixes.map((c) => h("div", { class: "fix-card" }, h("p", { class: "strike" }, c.said), h("p", { class: "de" }, c.better, " ", playBtn(c.better)), h("p", { class: "muted small" }, c.note))),
        h("h3", null, "⭐ Added to your practice deck"),
        ...f.practice.map((p) => h("div", { class: "chip static" }, h("strong", null, p.de), h("span", null, p.en))),
        h("p", { class: "muted small" }, saved ? `${saved} new phrases will appear in your next drills.` : "These were already in your deck."),
      );
    })
    .catch((e) => {
      clear(body);
      body.append(h("p", null, "⚠️ " + describeError(e)));
    });
}

// ---------- Phrases ----------

function renderPhrases() {
  tab = "phrases";
  const status = (p: Phrase) => {
    const c = state.cards[p.id];
    return !c ? "new" : c.interval >= 14 ? "strong" : c.reps > 0 ? "learning" : "new";
  };
  const groups: { key: string; title: string; emoji: string; why: string; items: Phrase[] }[] = [];
  if (state.saved.length) groups.push({ key: "mine", title: "My phrases", emoji: "⭐", why: "Saved from your conversations.", items: state.saved });
  for (const t of TOPICS) groups.push({ key: t.key, title: t.title, emoji: t.emoji, why: t.why, items: allPhrases().filter((p) => p.topic === t.key) });

  const screen = h(
    "main",
    { class: "screen" },
    topBar("Phrases", undefined, h("button", { class: "icon-btn", "aria-label": "Add phrase", onclick: addPhraseDialog }, "＋")),
    h("p", { class: "muted" }, "Whole sentences you can say without thinking. Tap a topic to practise it."),
    ...groups.map((g) => {
      const learned = g.items.filter((p) => status(p) !== "new").length;
      return h(
        "button",
        { class: "card topic", onclick: () => renderTopic(g) },
        h("span", { class: "quick-ico" }, g.emoji),
        h("div", { class: "topic-main" }, h("strong", null, g.title), h("span", { class: "muted small" }, g.why), h("div", { class: "progress thin" }, h("div", { class: "progress-fill", style: `width:${(learned / Math.max(1, g.items.length)) * 100}%` }))),
        h("span", { class: "muted small" }, `${learned}/${g.items.length}`),
      );
    }),
  );
  setScreen(screen);

  function renderTopic(g: (typeof groups)[number]) {
    const s = h(
      "main",
      { class: "screen" },
      topBar(`${g.emoji} ${g.title}`, renderPhrases),
      h("p", { class: "muted" }, g.why),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn primary", onclick: () => runShadow([...g.items].sort(() => Math.random() - 0.5).slice(0, 10), () => renderTopic(g)) }, "🎧 Shadow"),
        h("button", { class: "btn primary", onclick: () => runDrill(g.items.slice(0, 15).map((p) => ({ p, isNew: !state.cards[p.id] })), () => renderTopic(g)) }, "🎯 Drill"),
      ),
      ...g.items.map((p) =>
        h(
          "div",
          { class: "card phrase-row" },
          h("div", { class: "phrase-text" }, h("p", { class: "de" }, p.de), h("p", { class: "en small" }, p.en), p.tip ? h("p", { class: "tip small" }, "💡 " + p.tip) : null),
          h("span", { class: `dot ${status(p)}`, title: status(p) }),
          playBtn(p.de),
        ),
      ),
    );
    setScreen(s);
  }
}

function addPhraseDialog() {
  const de = h("input", { class: "text-in", placeholder: "German, e.g. Ich hab's eilig." }) as HTMLInputElement;
  const en = h("input", { class: "text-in", placeholder: "English meaning" }) as HTMLInputElement;
  const close = modal(
    h(
      "form",
      {
        class: "stack",
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (!de.value.trim()) return;
          toast(savePhrase(de.value, en.value) ? "Added ⭐" : "Already in your phrases");
          close();
          renderPhrases();
        },
      },
      h("h2", null, "Add your own phrase"),
      h("p", { class: "muted small" }, "Something you want to say in your real life. It'll show up in your drills."),
      de,
      en,
      h("button", { class: "btn primary wide", type: "submit" }, "Add"),
    ),
  );
  de.focus();
}

// ---------- Progress ----------

function renderProgress() {
  tab = "progress";
  const days = Object.entries(state.days);
  const totalMin = days.reduce((a, [, d]) => a + d.minutes, 0);
  const totalSpoken = days.reduce((a, [, d]) => a + d.spoken, 0);
  const activeDays = days.filter(([, d]) => d.minutes >= 5 || d.done).length;

  // Last 10 weeks heatmap, Monday-first columns.
  const cells: HTMLElement[] = [];
  const t = today();
  const dow = (new Date(t + "T12:00:00").getDay() + 6) % 7;
  const start = addDays(t, -(9 * 7 + dow));
  for (let k = 0; k < 70; k++) {
    const d = addDays(start, k);
    const m = state.days[d]?.minutes ?? 0;
    const lvl = d > t ? "future" : m === 0 ? "l0" : m < 10 ? "l1" : m < state.settings.dailyMinutes ? "l2" : "l3";
    cells.push(h("span", { class: `cell ${lvl}`, title: `${d}: ${Math.floor(m)} min` }));
  }

  const { index } = currentPhase();
  const screen = h(
    "main",
    { class: "screen" },
    topBar("Progress"),
    h(
      "div",
      { class: "grid2" },
      h("div", { class: "card kpi" }, h("strong", null, `🔥 ${streak()}`), h("span", null, "day streak")),
      h("div", { class: "card kpi" }, h("strong", null, `⏱️ ${Math.round(totalMin / 60 * 10) / 10} h`), h("span", null, "total speaking practice")),
      h("div", { class: "card kpi" }, h("strong", null, `🗣️ ${totalSpoken}`), h("span", null, "sentences spoken")),
      h("div", { class: "card kpi" }, h("strong", null, `📚 ${learnedCount()}`), h("span", null, "phrases learned")),
    ),
    h("section", { class: "card" }, h("h3", null, "Last 10 weeks"), h("div", { class: "heat" }, ...cells), h("p", { class: "muted small" }, `${activeDays} active days so far · goal: ${state.settings.dailyMinutes} min/day`)),
    h(
      "section",
      { class: "card" },
      h("h3", null, `Your road to ${new Date(state.settings.goalDate + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}`),
      h(
        "ol",
        { class: "road" },
        ...PHASES.map((p, i) => h("li", { class: i < index ? "past" : i === index ? "now" : "" }, h("strong", null, p.name), h("span", { class: "muted small" }, p.focus))),
      ),
    ),
  );
  setScreen(screen);
}

// ---------- Settings ----------

function renderSettings() {
  const st = state.settings;
  const field = (label: string, input: HTMLElement, hint?: string) => h("label", { class: "field" }, h("span", null, label), input, hint ? h("small", { class: "muted" }, hint) : null);
  const key = h("input", { class: "text-in", type: "password", value: st.apiKey, placeholder: "sk-ant-…", autocomplete: "off" }) as HTMLInputElement;
  const name = h("input", { class: "text-in", value: st.name, placeholder: "Your first name" }) as HTMLInputElement;
  const model = h(
    "select",
    { class: "text-in" },
    h("option", { value: "claude-opus-5-5" }, "Claude Opus 5.5 — best German (default)"),
    h("option", { value: "claude-sonnet-5-5" }, "Claude Sonnet 5.5 — faster, cheaper"),
    h("option", { value: "claude-haiku-5-5" }, "Claude Haiku 5.5 — fastest, cheapest"),
  ) as HTMLSelectElement;
  model.value = st.model;
  const voices = germanVoices();
  const voice = h("select", { class: "text-in" }, h("option", { value: "" }, "Automatic"), ...voices.map((v) => h("option", { value: v.voiceURI }, `${v.name} (${v.lang})`))) as HTMLSelectElement;
  voice.value = st.voiceURI;
  const rate = h("input", { type: "range", min: "0.6", max: "1.2", step: "0.05", value: String(st.rate) }) as HTMLInputElement;
  const minutes = h("input", { class: "text-in", type: "number", min: "5", max: "120", value: String(st.dailyMinutes) }) as HTMLInputElement;
  const perDay = h("input", { class: "text-in", type: "number", min: "0", max: "30", value: String(st.newPerDay) }) as HTMLInputElement;
  const goal = h("input", { class: "text-in", type: "date", value: st.goalDate }) as HTMLInputElement;
  const hands = h("input", { type: "checkbox", checked: st.handsFree }) as HTMLInputElement;
  const trans = h("input", { type: "checkbox", checked: st.showTranslation }) as HTMLInputElement;

  const persist = () => {
    st.apiKey = key.value.trim();
    st.name = name.value.trim();
    st.model = model.value;
    st.voiceURI = voice.value;
    st.rate = Number(rate.value);
    st.dailyMinutes = Math.max(5, Number(minutes.value) || 20);
    st.newPerDay = Math.max(0, Number(perDay.value) || 0);
    st.goalDate = goal.value || st.goalDate;
    st.handsFree = hands.checked;
    st.showTranslation = trans.checked;
    save();
    toast("Saved ✓");
    renderToday();
  };

  const exportData = () => {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `sprechen-backup-${today()}.json` });
    a.click();
  };
  const importData = () => {
    const inp = h("input", { type: "file", accept: "application/json" }) as HTMLInputElement;
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text()) as State;
        if (!data.cards || !data.settings) throw new Error();
        data.settings.apiKey = state.settings.apiKey;
        replaceState(data);
        toast("Progress restored ✓");
        renderToday();
      } catch {
        toast("That file isn't a valid backup.");
      }
    };
    inp.click();
  };

  const screen = h(
    "main",
    { class: "screen" },
    topBar("Settings", renderToday),
    h(
      "section",
      { class: "card stack" },
      h("h3", null, "🤖 AI conversation partner"),
      field("Claude API key", key, "Stored only on this device, sent only to Anthropic's API. Get one at console.anthropic.com."),
      field("Model", model),
      field("Your name", name),
    ),
    h(
      "section",
      { class: "card stack" },
      h("h3", null, "🔊 Voice"),
      field("German voice", voice, voices.length ? undefined : "No German voice found. On Android: Settings → Text-to-speech → install German. On iPhone: Settings → Accessibility → Spoken Content → Voices → German."),
      field("Speaking speed", rate),
      h("button", { class: "btn ghost", type: "button", onclick: () => { st.voiceURI = voice.value; speak("Hallo! So klinge ich. Wie findest du meine Stimme?", Number(rate.value)); } }, "🔊 Test voice"),
      h("label", { class: "toggle" }, hands, h("span", null, "Hands-free: start the mic automatically")),
      h("label", { class: "toggle" }, trans, h("span", null, "Always show English under AI replies")),
    ),
    h(
      "section",
      { class: "card stack" },
      h("h3", null, "🎯 Goal"),
      field("Daily practice (minutes)", minutes),
      field("New phrases per day", perDay),
      field("Speak fluently by", goal),
    ),
    h("button", { class: "btn primary wide", onclick: persist }, "Save"),
    h(
      "section",
      { class: "card stack" },
      h("h3", null, "💾 Your data"),
      h("p", { class: "muted small" }, "Progress is saved on this phone. Back it up now and then."),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: exportData }, "Export"), h("button", { class: "btn", onclick: importData }, "Import")),
      h("button", { class: "btn bad", onclick: () => { if (confirm("Delete all progress? This can't be undone.")) { resetAll(); renderToday(); } } }, "Reset all progress"),
    ),
  );
  setScreen(screen, { tabs: false });
}

// ---------- First run ----------

function onboarding() {
  const name = h("input", { class: "text-in", placeholder: "Your first name (optional)" }) as HTMLInputElement;
  const screen = h(
    "main",
    { class: "screen center onboarding" },
    h("div", { class: "celebrate" }, "🇩🇪"),
    h("h1", null, "Sprechen"),
    h("p", { class: "lead" }, `Speak German fluently by ${new Date(state.settings.goalDate + "T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })}.`),
    h(
      "ul",
      { class: "how" },
      h("li", null, "🗣️ ", h("strong", null, "Speak out loud, every day."), " ~20 minutes. No grammar tables, no levels."),
      h("li", null, "🎧 ", h("strong", null, "Shadow"), " native-sounding phrases until they're automatic."),
      h("li", null, "🎯 ", h("strong", null, "Recall"), " — see English, say German. Smart repetition brings it back right before you forget."),
      h("li", null, "🤖 ", h("strong", null, "Talk"), " with an AI partner who gently corrects you and helps when you're stuck."),
    ),
    name,
    h(
      "button",
      {
        class: "btn primary wide",
        onclick: async () => {
          state.settings.name = name.value.trim();
          save();
          localStorage.setItem("sprechen-onboarded", "1");
          if (canListen()) {
            // Ask for the mic now so it doesn't surprise them mid-drill.
            try {
              const s = await navigator.mediaDevices?.getUserMedia({ audio: true });
              s?.getTracks().forEach((t) => t.stop());
            } catch {
              /* user can allow later */
            }
          }
          renderToday();
        },
      },
      "Los geht's! →",
    ),
    h("p", { class: "muted small" }, "Tip: add this app to your home screen for a full-screen experience."),
  );
  setScreen(screen, { tabs: false });
}

// ---------- Boot ----------

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

if (localStorage.getItem("sprechen-onboarded")) renderToday();
else onboarding();
