import { ALL_PHRASES, Phrase } from "./content";

export interface CardState {
  interval: number; // days
  ease: number;
  due: string; // YYYY-MM-DD
  reps: number;
  lapses: number;
}

export interface DayLog {
  minutes: number;
  spoken: number; // utterances spoken
  done: boolean; // finished the daily session
}

export interface Settings {
  apiKey: string;
  model: string;
  rate: number; // TTS speed
  voiceURI: string;
  dailyMinutes: number;
  newPerDay: number;
  handsFree: boolean;
  showTranslation: boolean;
  goalDate: string;
  name: string;
}

export interface SavedPhrase extends Phrase {
  added: string;
}

export interface State {
  v: 1;
  started: string;
  cards: Record<string, CardState>;
  days: Record<string, DayLog>;
  saved: SavedPhrase[];
  settings: Settings;
}

const KEY = "sprechen-state-v1";

export function today(d = new Date()): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return today(d);
}

function defaultGoal(): string {
  const now = new Date();
  // End of the next March.
  const year = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-03-31`;
}

function fresh(): State {
  return {
    v: 1,
    started: today(),
    cards: {},
    days: {},
    saved: [],
    settings: {
      apiKey: "",
      model: "claude-opus-5-5",
      rate: 0.95,
      voiceURI: "",
      dailyMinutes: 20,
      newPerDay: 8,
      handsFree: true,
      showTranslation: false,
      goalDate: defaultGoal(),
      name: "",
    },
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      const f = fresh();
      return { ...f, ...s, settings: { ...f.settings, ...s.settings } };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return fresh();
}

export const state: State = load();

export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable */
  }
}

export function replaceState(next: State): void {
  Object.assign(state, next);
  save();
}

export function resetAll(): void {
  replaceState(fresh());
}

export function dayLog(d = today()): DayLog {
  return (state.days[d] ??= { minutes: 0, spoken: 0, done: false });
}

export function addMinutes(min: number): void {
  dayLog().minutes += min;
  save();
}

export function countSpoken(): void {
  dayLog().spoken += 1;
  save();
}

export function streak(): number {
  let n = 0;
  let d = today();
  const active = (x: string) => {
    const l = state.days[x];
    return !!l && (l.done || l.minutes >= 5);
  };
  if (!active(d)) d = addDays(d, -1); // today not done yet doesn't break the streak
  while (active(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function allPhrases(): Phrase[] {
  return [...state.saved, ...ALL_PHRASES];
}

export function findPhrase(id: string): Phrase | undefined {
  return allPhrases().find((p) => p.id === id);
}

/** Phrases due for review today, oldest due first. */
export function dueCards(): Phrase[] {
  const t = today();
  return allPhrases()
    .filter((p) => state.cards[p.id] && state.cards[p.id].due <= t)
    .sort((a, b) => state.cards[a.id].due.localeCompare(state.cards[b.id].due));
}

/** Next unseen phrases in curriculum order (saved phrases from conversations first). */
export function newCards(n: number): Phrase[] {
  return allPhrases()
    .filter((p) => !state.cards[p.id])
    .slice(0, n);
}

export type Grade = 0 | 1 | 2; // again, ok, easy

export function grade(id: string, g: Grade): void {
  const c: CardState = state.cards[id] ?? { interval: 0, ease: 2.4, due: today(), reps: 0, lapses: 0 };
  if (g === 0) {
    c.lapses++;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
  } else {
    c.reps++;
    if (c.interval === 0) c.interval = g === 2 ? 3 : 1;
    else c.interval = Math.round(c.interval * (g === 2 ? c.ease + 0.3 : c.ease));
    if (g === 2) c.ease = Math.min(3, c.ease + 0.1);
  }
  c.due = addDays(today(), c.interval);
  state.cards[id] = c;
  save();
}

export function learnedCount(): number {
  return Object.values(state.cards).filter((c) => c.reps > 0).length;
}

export function savePhrase(de: string, en: string): boolean {
  const norm = de.trim().toLowerCase();
  if (allPhrases().some((p) => p.de.trim().toLowerCase() === norm)) return false;
  state.saved.unshift({ id: `mine-${Date.now()}`, de: de.trim(), en: en.trim(), topic: "mine", added: today() });
  save();
  return true;
}

export function daysLeft(): number {
  const ms = new Date(state.settings.goalDate + "T23:59:59").getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/** 0..1 progress through the journey from start date to the goal date. */
export function journeyProgress(): number {
  const start = new Date(state.started + "T00:00:00").getTime();
  const end = new Date(state.settings.goalDate + "T23:59:59").getTime();
  return Math.min(1, Math.max(0, (Date.now() - start) / Math.max(1, end - start)));
}

export interface Phase {
  name: string;
  focus: string;
  scenarios: string[];
}

export const PHASES: Phase[] = [
  { name: "Find your voice", focus: "Rescue phrases, fillers, introducing yourself. Speak out loud every day — imperfect is fine.", scenarios: ["intro", "free", "cafe"] },
  { name: "Everyday autopilot", focus: "Daily routine, café, getting around. Aim for answers of 2–3 sentences.", scenarios: ["day", "cafe", "plans", "free"] },
  { name: "Tell stories", focus: "Past tense (Perfekt) storytelling. Keep going even when you make mistakes.", scenarios: ["weekend", "work", "doctor", "free"] },
  { name: "Say what you think", focus: "Opinions, reasons, feelings. Use weil / dass / ich finde.", scenarios: ["debate", "flat", "problem", "life"] },
  { name: "Free flow", focus: "Long, natural conversations. Mostly talk, little reviewing.", scenarios: ["interview", "debate", "life", "free"] },
];

export function currentPhase(): { phase: Phase; index: number } {
  const i = Math.min(PHASES.length - 1, Math.floor(journeyProgress() * PHASES.length));
  return { phase: PHASES[i], index: i };
}

export function exportJSON(): string {
  return JSON.stringify({ ...state, settings: { ...state.settings, apiKey: "" } });
}
