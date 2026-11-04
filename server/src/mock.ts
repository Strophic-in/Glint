/**
 * MOCK_AI=1 replaces OpenAI with canned, realistic output so the whole product
 * (overlay, streaming, metering, auto-answer) can be developed without spending tokens.
 */
import type { Action } from './prompts.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ANSWERS: Record<string, string> = {
  answer: `**Say:** "The project I'm proudest of is the checkout rewrite at my last team. We cut p95 latency from **1.8 s to 420 ms** and lifted conversion by **3.1%**."

- Root cause was N+1 queries plus a blocking fraud check, so we moved fraud to an async pre-auth
- Rolled out behind a flag to 5% → 50% → 100% over two weeks
- Mention the on-call runbook you wrote; it shows ownership`,
  screen: `**Answer: B. O(n log n)**

Sorting dominates; the single pass afterwards is O(n).

\`\`\`python
def merge_intervals(xs):
    xs.sort(key=lambda x: x[0])
    out = []
    for s, e in xs:
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out
\`\`\`
Time: O(n log n) · Space: O(n)`,
  shorter: `**Say:** "I rebuilt our checkout, cutting latency 4× and lifting conversion 3%."`,
  followups: `1. What does success look like for this role in the first 90 days?
2. Which part of the stack is causing the most pain right now?
3. How does the team decide what to build next quarter?`,
  recap: `**Summary**: Discussed the checkout rewrite and system design for a rate limiter.

**Next steps**
- Send the design doc link after the call`,
};

export async function* mockAnswer(action: Action, question: string): AsyncGenerator<string> {
  let text = ANSWERS[action] ?? ANSWERS.answer!;
  if (action === 'ask' && question) text = `**Here's the short version:** you asked "${question.slice(0, 80)}".\n\n${ANSWERS.answer}`;
  await sleep(250); // simulated time-to-first-token
  for (const piece of text.match(/\S+\s*|\s+/g) ?? []) {
    yield piece;
    await sleep(12);
  }
}

const THEM_LINES = [
  'So, can you walk me through a project you are most proud of?',
  'Interesting. How would you design a rate limiter for an API that serves millions of users?',
  'What would you do differently if you had to build it again?',
  'Great, and do you have any questions for us?',
];
const YOU_LINES = ['Sure, let me think about that for a second.', 'Yes, that makes sense.', 'Happy to go deeper on that.'];

export class MockTranscriber {
  private n = 0;
  private bytes = 0;
  constructor(
    private src: 'you' | 'them',
    private emit: (msg: { type: 'delta' | 'final'; id: string; text: string }) => void,
  ) {}
  append(pcm: Buffer) {
    this.bytes += pcm.length;
  }
  async commit() {
    if (this.bytes < 4800) return;
    this.bytes = 0;
    const lines = this.src === 'them' ? THEM_LINES : YOU_LINES;
    const text = lines[this.n % lines.length]!;
    const id = `mock_${this.src}_${++this.n}`;
    let acc = '';
    for (const w of text.split(' ')) {
      acc += (acc ? ' ' : '') + w;
      this.emit({ type: 'delta', id, text: (acc === w ? '' : ' ') + w });
      await sleep(35);
    }
    this.emit({ type: 'final', id, text });
  }
  close() {}
}
