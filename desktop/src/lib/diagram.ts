// Mermaid diagrams (architecture, flows) for the code panel. Mermaid is large, so it is only
// loaded the first time an answer contains a diagram.

type Mermaid = typeof import('mermaid').default;

let loading: Promise<Mermaid> | null = null;
const cache = new Map<string, Promise<string>>();
let seq = 0;

function load(): Promise<Mermaid> {
  return (loading ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict', // model output: no scripts, no click handlers, sanitised labels
      suppressErrorRendering: true,
      theme: 'dark',
      fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
      themeVariables: {
        background: 'transparent',
        fontSize: '13px',
        primaryColor: '#1d2030',
        primaryTextColor: '#eceef2',
        primaryBorderColor: '#f5b83d',
        secondaryColor: '#232736',
        tertiaryColor: '#151821',
        lineColor: '#9aa1ae',
        textColor: '#eceef2',
        clusterBkg: 'rgba(255,255,255,0.03)',
        clusterBorder: 'rgba(255,255,255,0.18)',
        edgeLabelBackground: '#151821',
      },
      // Natural size (the panel scrolls) rather than shrinking big diagrams until labels are unreadable.
      flowchart: { curve: 'basis', padding: 10, useMaxWidth: false },
      sequence: { useMaxWidth: false },
      class: { useMaxWidth: false },
      state: { useMaxWidth: false },
      er: { useMaxWidth: false },
    });
    return mermaid;
  }));
}

/** Mermaid source → SVG markup. Rejects if the source can't be drawn. */
export function renderDiagram(source: string): Promise<string> {
  let svg = cache.get(source);
  if (!svg) {
    svg = load()
      .then((m) => m.render(`glint-diagram-${++seq}`, source))
      .then((r) => r.svg);
    cache.set(source, svg);
    svg.catch(() => cache.delete(source));
    if (cache.size > 30) cache.delete(cache.keys().next().value!);
  }
  return svg;
}
