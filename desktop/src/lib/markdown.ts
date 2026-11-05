import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';

for (const [name, lang] of Object.entries({ python, javascript, typescript, java, cpp, csharp, go, sql, bash, json })) {
  hljs.registerLanguage(name, lang);
}
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['c', 'c++', 'h'], { languageName: 'cpp' });
hljs.registerAliases(['cs', 'c#'], { languageName: 'csharp' });
hljs.registerAliases(['sh', 'shell', 'powershell'], { languageName: 'bash' });

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const langOf = (lang: string | undefined) => (lang ?? '').trim().split(/\s/)[0]?.toLowerCase() ?? '';

function highlight(text: string, lang: string): string {
  return lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : escape(text);
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }) {
      const l = langOf(lang);
      return `<div class="code"><div class="code-bar"><span>${escape(l || 'code')}</span><button type="button" class="copy-code">Copy</button></div><pre><code class="hljs">${highlight(text, l)}</code></pre></div>`;
    },
    link({ text }) {
      // Links are not clickable in the overlay (keeps focus where it is).
      return `<span class="link">${text}</span>`;
    },
  },
});

const PURIFY = { FORBID_TAGS: ['style', 'img', 'iframe', 'form', 'input'], FORBID_ATTR: ['style'] };

/** Markdown → sanitised HTML. Model output can echo on-screen text, so always sanitise. */
export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string, PURIFY);
}

export interface CodeBlock {
  lang: string;
  code: string;
  /** Highlighted, sanitised HTML for <pre><code>. */
  html: string;
  lines: number;
  /** A Mermaid diagram (architecture, flow), drawn instead of shown as code. */
  diagram: boolean;
  /** The closing fence has arrived (the block is no longer streaming). */
  complete: boolean;
}

/** Blocks this short stay inline: a one-line command reads better next to its sentence. */
const MIN_PANEL_LINES = 3;

type Tok = { type: string; text?: string; lang?: string; tokens?: Tok[]; items?: Tok[] } & Record<string, unknown>;

/**
 * Markdown → { explanation HTML, code blocks }. Longer code blocks move to the side panel and leave
 * a small marker in the text that points to them. While an answer streams, an unclosed fence is
 * already a code block, so code fills the panel as it arrives.
 */
export function renderAnswer(md: string, splitCode: boolean, side: 'left' | 'right' = 'left'): { html: string; blocks: CodeBlock[] } {
  if (!splitCode) return { html: renderMarkdown(md), blocks: [] };
  const tokens = marked.lexer(md) as unknown as Tok[];
  const blocks: CodeBlock[] = [];
  const arrow = side === 'right' ? '→' : '←';
  const pull = (list: Tok[] | undefined) => {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      if (t.type === 'code') {
        const code = (t.text ?? '').replace(/\n+$/, '');
        const lines = code ? code.split('\n').length : 0;
        const lang = langOf(t.lang);
        const diagram = lang === 'mermaid';
        if (!lines || (!diagram && lines < MIN_PANEL_LINES)) continue;
        const raw = String(t.raw ?? '').trimEnd();
        const complete = raw.split('\n').length > 1 && /(^|\n) {0,3}(`{3,}|~{3,})$/.test(raw);
        const n = blocks.length;
        blocks.push({ lang, code, lines, diagram, complete, html: diagram ? '' : DOMPurify.sanitize(highlight(code, lang)) });
        const marker = diagram
          ? `<div class="code-ref" data-ref="${n}"><span class="arrow">${arrow}</span><b>diagram</b><span>in the side panel</span></div>`
          : `<div class="code-ref" data-ref="${n}"><span class="arrow">${arrow}</span><b>${escape(lang || 'code')}</b><span>${lines} lines · in the code panel</span></div>`;
        list[i] = { type: 'html', block: true, pre: false, raw: t.raw as string, text: marker } as Tok;
      } else {
        pull(t.tokens);
        pull(t.items);
      }
    }
  };
  pull(tokens);
  const html = marked.parser(tokens as never) as string;
  return { html: DOMPurify.sanitize(html, PURIFY), blocks };
}
