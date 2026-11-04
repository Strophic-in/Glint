// Accelerators use KeyboardEvent.code names, which the Rust hotkey parser accepts directly.

const PRETTY: Record<string, string> = {
  Backslash: '\\',
  Enter: '↵',
  Space: 'Space',
  ArrowUp: '↑',
  Up: '↑',
  ArrowDown: '↓',
  Down: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Slash: '/',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Backspace: '⌫',
  Escape: 'Esc',
};

export function keyParts(accel: string): string[] {
  if (!accel) return [];
  return accel.split('+').map((p) => {
    if (/^Key[A-Z]$/.test(p)) return p.slice(3);
    if (/^Digit\d$/.test(p)) return p.slice(5);
    if (p === 'Super' || p === 'Meta') return 'Win';
    return PRETTY[p] ?? p;
  });
}

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

/** Build an accelerator from a keydown. Returns null while only modifiers are held. */
export function accelFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  const isFn = /^F\d{1,2}$/.test(e.code);
  if (!mods.length && !isFn) return null; // global shortcuts need a modifier
  return [...mods, e.code].join('+');
}
