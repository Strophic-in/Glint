// Copied from desktop/src/lib/question.ts so the landing page runs the exact detector the app ships.
// Keep the two in sync.
// Cheap, fast "is there a question for me in this?" check on what the other side said, plus pulling
// out the question itself: "Okay, thanks for that. So, what is a website? Take your time." →
// "What is a website?". Runs on every caption update, so it is pure string work, no AI.

const FILLER = /^((hi|hello|hey|so|and|okay|ok|right|great|alright|all right|well|now|um+|uh+|hmm+|yeah|yes|cool|perfect|nice|good|thanks|thank you|next|then|got it|i see|sure|fine)[\s,.!-]+)+/i;

const STARTERS =
  /^(what|why|how|when|where|who|whom|whose|which|can|could|would|will|should|shall|do|does|did|is|are|was|were|have|has|had|may|might|tell me|walk me|walk us|explain|describe|define|give me|give us|talk (me |us )?(through|about)|share|help me understand|what's|how's|why's|where's|who's|any|name|list|compare|differentiate|write|design|implement)\b/i;

const ANYWHERE =
  /\b(tell me about|tell us about|walk me through|walk us through|how would you|what would you|how do you|how did you|can you|could you|would you|why did you|why do you|what is your|what are your|what's your|do you have any|have you ever|give me an example|what is the difference|what's the difference|difference between|what do you mean by|what do you know about|are you familiar with)\b/i;

export interface FoundQuestion {
  /** Cleaned up for display and for the AI: fillers dropped, capitalised, ends in "?" if asked as one. */
  text: string;
  /** Where it sits in the original caption, for highlighting. */
  start: number;
  end: number;
}

// Not questions for the user: filler, tag questions and call logistics.
const RHETORICAL =
  /^(you know( what i mean)?|know what i mean|right|okay|ok|yeah|isn't it|aren't they|don't you think|make sense|does that make sense|is that clear|you see|see what i mean|can you hear me|can you see my screen|is my screen visible|are you there|am i audible|shall we (start|begin|get started)|are you ready|ready|how are you( doing)?( today)?|how's it going|good morning|good afternoon|good evening|hello|hi)\b(\s+[\w']+){0,3}[\s?]*$/i;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function isAsk(sentence: string): boolean {
  const s = sentence.trim().replace(FILLER, '');
  if (RHETORICAL.test(s.replace(/[?.!\s]+$/, '') + '?')) return false;
  if (/\?\s*["')\]]?\s*$/.test(sentence)) return words(s) >= 2;
  if (words(s) < 3) return false;
  return STARTERS.test(s) || ANYWHERE.test(s);
}

/** Sentences with their positions. Speech-to-text often skips punctuation, so a long unpunctuated
 *  caption is one "sentence"; that's fine, the starter check still works on it. */
function sentences(text: string): { s: string; start: number; end: number }[] {
  const out: { s: string; start: number; end: number }[] = [];
  const re = /[^.!?]+(?:[.!?]+["')\]]?|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0].trim()) {
      if (re.lastIndex === m.index) re.lastIndex++;
      continue;
    }
    const lead = m[0].length - m[0].trimStart().length;
    out.push({ s: m[0].trim(), start: m.index + lead, end: m.index + m[0].trimEnd().length });
  }
  return out;
}

function tidy(q: string): string {
  let t = q.trim().replace(FILLER, '').trim();
  // A question split by STT into "...website. Like in general?" stays as one; just tidy the ends.
  t = t.replace(/[\s,;:-]+$/, '');
  if (!t) return q.trim();
  t = t[0].toUpperCase() + t.slice(1);
  const imperative = /^(tell|walk|explain|describe|define|give|talk|share|help|name|list|compare|differentiate|write|design|implement)\b/i.test(t);
  if (!/[.?!]$/.test(t)) t += imperative ? '.' : '?';
  else if (!imperative && t.endsWith('.')) t = t.slice(0, -1) + '?';
  return t;
}

/** The question in what they said, or null. Looks at the last few sentences (what came right before
 *  the pause), and joins back-to-back questions: "What is a website? And how does it load?" */
export function extractQuestion(text: string): FoundQuestion | null {
  const t = text.trim();
  if (!t) return null;
  const parts = sentences(text).slice(-4);
  let last = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isAsk(parts[i].s)) {
      last = i;
      break;
    }
  }
  if (last < 0) return null;
  let first = last;
  while (first > 0 && isAsk(parts[first - 1].s)) first--;
  const start = parts[first].start;
  const end = parts[last].end;
  const raw = text.slice(start, end);
  // Skip the filler at the front of the highlight too, so the yellow starts at the question.
  const lead = raw.match(FILLER)?.[0].length ?? 0;
  return { text: tidy(raw), start: start + lead, end };
}

export function isQuestion(text: string): boolean {
  return extractQuestion(text) !== null;
}
