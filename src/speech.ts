import { state } from "./store";

// ---------- Text to speech ----------

let voices: SpeechSynthesisVoice[] = [];

function refreshVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("de"));
}
if ("speechSynthesis" in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}

export function germanVoices(): SpeechSynthesisVoice[] {
  refreshVoices();
  return voices;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const list = germanVoices();
  return (
    list.find((v) => v.voiceURI === state.settings.voiceURI) ??
    list.find((v) => /de-DE/i.test(v.lang) && /google|enhanced|premium|anna|petra|helena/i.test(v.name)) ??
    list.find((v) => /de-DE/i.test(v.lang)) ??
    list[0]
  );
}

export function canSpeak(): boolean {
  return "speechSynthesis" in window;
}

/** Speak German text. Resolves when finished (or immediately if TTS is unavailable). */
export function speak(text: string, rate = state.settings.rate): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve();
    stopListening();
    speechSynthesis.cancel();
    // Strip ellipsis placeholders so TTS doesn't read "dot dot dot".
    const u = new SpeechSynthesisUtterance(text.replace(/…/g, ", "));
    u.lang = "de-DE";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = rate;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    u.onend = finish;
    u.onerror = finish;
    // Safety timeout: some mobile browsers never fire onend.
    setTimeout(finish, 1500 + text.length * 110 / rate);
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) speechSynthesis.cancel();
}

// ---------- Speech recognition ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function canListen(): boolean {
  return !!SR;
}

let current: any = null;

export interface ListenOptions {
  onInterim?: (text: string) => void;
  /** Keep listening across pauses until stopListening() (for longer answers). */
  continuous?: boolean;
  /** Recognition language, default de-DE. */
  lang?: string;
}

/** Listen for German speech. Resolves with the final transcript ("" if nothing heard). */
export function listen(opts: ListenOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error("Speech recognition isn't supported in this browser. Try Chrome or Safari."));
    stopListening();
    stopSpeaking();
    const rec = new SR();
    current = rec;
    rec.lang = opts.lang ?? "de-DE";
    rec.interimResults = true;
    rec.continuous = !!opts.continuous;
    rec.maxAlternatives = 1;
    let finalText = "";
    let interim = "";
    rec.onresult = (e: any) => {
      interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      opts.onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed") reject(new Error("Microphone access was blocked. Allow the microphone for this site in your browser settings."));
      else reject(new Error("Speech recognition error: " + e.error));
    };
    rec.onend = () => {
      if (current === rec) current = null;
      resolve((finalText + interim).trim());
    };
    try {
      rec.start();
    } catch (err) {
      reject(err as Error);
    }
  });
}

export function stopListening(): void {
  if (current) {
    try {
      current.stop();
    } catch {
      /* already stopped */
    }
  }
}

export function isListening(): boolean {
  return !!current;
}

// ---------- Pronunciation / answer comparison ----------

export function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/…|\.\.\./g, " ")
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[a.length];
}

export interface WordMatch {
  word: string; // original target word
  ok: boolean;
}

/**
 * Compare what was said to the target. Alternatives separated by " / " are each tried.
 * Returns a 0..1 score and per-word hits on the best-matching alternative.
 */
export function compare(target: string, said: string): { score: number; words: WordMatch[] } {
  const alts = target.split(" / ").map((s) => s.trim());
  const saidWords = normalize(said);
  let best = { score: 0, words: [] as WordMatch[] };
  for (const alt of alts) {
    const raw = alt.replace(/…/g, " ").split(/\s+/).filter((w) => normalize(w).length);
    const words = raw.map((w) => {
      const n = normalize(w).join("");
      const ok = saidWords.some((s) => s === n || (n.length > 4 && lev(s, n) <= 1));
      return { word: w, ok };
    });
    const hits = words.filter((w) => w.ok).length;
    const tNorm = normalize(alt).join(" ");
    const sNorm = saidWords.join(" ");
    const charScore = 1 - lev(tNorm, sNorm) / Math.max(tNorm.length, sNorm.length, 1);
    const score = words.length ? 0.6 * (hits / words.length) + 0.4 * Math.max(0, charScore) : 0;
    if (score > best.score || !best.words.length) best = { score, words };
  }
  return best;
}
