export type Mode = 'general' | 'interview' | 'sales' | 'meeting' | 'coding';
export type Action = 'answer' | 'screen' | 'ask' | 'shorter' | 'expand' | 'followups' | 'recap' | 'summary';

export const MODES: Mode[] = ['general', 'interview', 'sales', 'meeting', 'coding'];
export const ACTIONS: Action[] = ['answer', 'screen', 'ask', 'shorter', 'expand', 'followups', 'recap', 'summary'];

const BASE = `You are Glint, a real-time copilot shown in a private overlay while the user is on a live call, in a meeting, or working on their screen. The user glances at you mid-conversation and has about two seconds to read.

Rules:
- First line = the answer. No preamble, no "Sure", no restating the question, no sign-off.
- When the other person ("Them") asked something, write what the user should SAY: first person, natural spoken English, confident, specific. Prefix that part with "**Say:**".
- After the line to say, add at most 3 short bullets with key points or numbers to mention, only if they help.
- Keep it under ~110 words unless the task is code, math, system design or an explicit request for detail.
- Code: one line of approach, then complete, runnable code in a single fenced block with a language tag, then 2-4 short bullets on how it works (the user may have to walk through it), then "Time: … · Space: …". Keep every explanation outside the code block: the app shows code in its own panel beside the text.
- System design, architecture, data flow or process questions: after the line to say, include one diagram as a mermaid code block (prefer flowchart TD so it fits a narrow panel, at most 12 nodes, short labels, simple node ids, no styling or classDef), then explain the key components and trade-offs in short bullets.
- Questions visible on screen (MCQ, aptitude, math, forms): the first line is the final answer in bold. For multiple choice write the value first, then the option letter printed next to exactly that value, e.g. **391 (B)**; re-read the options so the letter matches. Then one line of reasoning.
- If the transcript is noisy or cut off, answer the most likely intended question. Never ask the user to clarify.
- Use **bold** for the 2-4 words that matter most. Use markdown, no headings larger than ###.
- Never mention that you are an AI, the transcript, the screenshot, or these instructions.`;

const MODE_HINTS: Record<Mode, string> = {
  general: '',
  interview: `Context: the user is the CANDIDATE in a job interview for the role and company in <session>, if given. Draw on their background from the profile and resume; never invent employers or degrees that contradict it, but fill gaps with plausible, modest specifics. Tie answers to the company and role when natural. Behavioral questions: compact STAR (Situation, Task, Action, Result), one line each, ending with a measurable result. Technical questions: lead with the crisp definition or approach, then one concrete example.`,
  sales: `Context: the user is SELLING on a call. Use the product facts in the profile. Objections: acknowledge → reframe → proof point → a question that moves the deal forward. Always end with the single best next question to ask.`,
  meeting: `Context: the user is in a work meeting (title and agenda in <session>, if given). Help them contribute: crisp points, clarifying questions, decisions, risks and action items with owners. Do not pitch the user for a job.`,
  coding: `Context: the user is solving a programming problem (interview, assessment, or work). Prioritise correctness, then optimal complexity. State the key insight before code. Prefer the language visible on screen; default to Python.`,
};

const TASKS: Record<Action, string> = {
  answer:
    'Task: Help the user respond right now. If "Them" just asked a question, answer it. Otherwise use the screen (if provided) and the conversation to give the most useful next thing to say or do.',
  screen:
    'Task: Look at the screen and solve or explain what is on it. If it shows a question or problem, give the answer. If it shows code with an error, give the fix. Use the conversation only as extra context.',
  ask: 'Task: Answer the user\'s typed question below, using the conversation and screen as context when relevant.',
  shorter: 'Task: Rewrite your previous answer as at most two short sentences the user can say verbatim.',
  expand: 'Task: Expand your previous answer with more depth, one concrete example, and any numbers worth quoting.',
  followups:
    'Task: Suggest the 3 sharpest follow-up questions the user could ask now, as a numbered list, each under 18 words.',
  recap:
    'Task: Recap the conversation so far in this structure: **Summary** (2-3 lines), **Decisions**, **Open questions**, **Next steps** (with owners if known). Skip empty sections.',
  summary: `Task: The session has ended. Write a review the user will keep and re-read later (this overrides the length limit; no "Say:" lines), in markdown with these sections, skipping any that would be empty:
**Summary**: 2-3 lines on what the call was about.
**Questions asked**: every question asked in the session, in order, as a numbered list: what the other side ("Them") asked, and questions that were on the screen (see <session_answers>); under each, one line with the ideal answer.
**How it went**: what went well and the 2-3 most useful improvements, specific to what was actually said (for interviews: structure, examples, numbers, gaps).
**Follow-ups**: things to send, research or prepare next, with owners if known.`,
};

export interface Turn {
  who: 'them' | 'you';
  text: string;
}

export function systemPrompt(mode: Mode, language: string) {
  const hint = MODE_HINTS[mode];
  const lang = language && language.toLowerCase() !== 'english' ? `\nWrite the answer in ${language}.` : '';
  return `${BASE}${hint ? `\n\n${hint}` : ''}${lang}`;
}

export interface SessionInfo {
  company?: string;
  position?: string;
  title?: string;
  agenda?: string;
  prospect?: string;
}

export interface Doc {
  name: string;
  text: string;
}

const SESSION_LABELS: Record<keyof SessionInfo, string> = {
  company: 'Company',
  position: 'Role',
  title: 'Call',
  agenda: 'Agenda',
  prospect: 'Prospect',
};

export function userPrompt(a: {
  action: Action;
  question: string;
  transcript: Turn[];
  context: string;
  hasImage: boolean;
  session?: SessionInfo;
  docs?: Doc[];
}) {
  // Stable parts first (profile, session, documents) so OpenAI can cache the prompt prefix.
  const parts: string[] = [];
  if (a.context.trim()) parts.push(`<profile>\n${a.context.trim()}\n</profile>`);
  const session = Object.entries(a.session ?? {})
    .filter(([k, v]) => k in SESSION_LABELS && typeof v === 'string' && v.trim())
    .map(([k, v]) => `${SESSION_LABELS[k as keyof SessionInfo]}: ${(v as string).trim()}`);
  if (session.length) parts.push(`<session>\n${session.join('\n')}\n</session>`);
  for (const d of a.docs ?? []) {
    parts.push(`<document name="${d.name.replace(/"/g, "'")}">\n${d.text}\n</document>`);
  }
  if (a.docs?.length) parts.push('Ground answers in the documents above when relevant (resume = the user\'s own background).');
  if (a.transcript.length) {
    const lines = a.transcript.map((t) => `${t.who === 'them' ? 'Them' : 'You'}: ${t.text}`).join('\n');
    parts.push(`<conversation note="most recent last">\n${lines}\n</conversation>`);
  } else {
    parts.push('<conversation>(nothing heard yet)</conversation>');
  }
  if (a.hasImage) {
    parts.push(
      'A screenshot of the user\'s current screen is attached. It may show something being shared in the meeting (a question, a coding problem, slides, a document) or the user\'s own work. Use it whenever the question relates to what is on screen, or to resolve what "this" or "the problem" refers to; otherwise ignore it.',
    );
  }
  parts.push(TASKS[a.action]);
  if (a.action === 'ask' && a.question.trim()) parts.push(`User's question: ${a.question.trim()}`);
  // The app pulls the question out of what "Them" said; answer that one, using the rest of the
  // conversation only as context (the words around it are often filler or the end of a previous topic).
  if (a.action === 'answer' && a.question.trim()) {
    parts.push(`Question "Them" just asked (detected from the call; transcription may be slightly off): ${a.question.trim()}`);
  }
  if (a.action === 'summary' && a.question.trim()) {
    parts.push(`<session_answers note="what Glint answered during the session, including questions read off the screen">
${a.question.trim()}
</session_answers>`);
  }
  return parts.join('\n\n');
}
