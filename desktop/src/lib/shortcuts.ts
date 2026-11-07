/** Rebindable actions, shown in Settings and in the Ctrl+? overlay. Order is display order. */
export const SHORTCUTS: { key: string; label: string }[] = [
  { key: 'answer', label: 'Answer now' },
  { key: 'screen', label: 'Solve screen' },
  { key: 'listen', label: 'Mic on / off (starts a session if none)' },
  { key: 'type', label: 'Type a question' },
  { key: 'toggle', label: 'Collapse / expand Glint' },
  { key: 'toggle_code', label: 'Show / hide code panel' },
  { key: 'shortcuts', label: 'Show all shortcuts' },
  { key: 'scroll_up', label: 'Scroll answer up' },
  { key: 'scroll_down', label: 'Scroll answer down' },
];
