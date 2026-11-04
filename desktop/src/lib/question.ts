// Cheap, fast "is this a question for me?" check on a finished utterance from the other side.
const STARTERS =
  /^(so,?\s+|and\s+|okay,?\s+|ok,?\s+|right,?\s+|great,?\s+|alright,?\s+)?(what|why|how|when|where|who|whom|whose|which|can|could|would|will|should|shall|do|does|did|is|are|was|were|have|has|had|may|might|tell me|walk me|explain|describe|give me|talk (me )?(through|about)|share|help me understand|what's|how's|why's|where's|who's|any)\b/i;

const ANYWHERE =
  /\b(tell me about|walk me through|how would you|what would you|how do you|how did you|can you|could you|why did you|what is your|what are your|what's your|do you have any|have you ever|give me an example)\b/i;

export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.split(/\s+/).length < 4) return false;
  if (/\?\s*["')\]]?\s*$/.test(t)) return true;
  const last = t.split(/(?<=[.!?])\s+/).pop()?.trim() ?? t;
  return STARTERS.test(last) || ANYWHERE.test(last);
}
