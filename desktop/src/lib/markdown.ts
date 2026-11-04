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

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }) {
      const l = (lang ?? '').trim().split(/\s/)[0]?.toLowerCase() ?? '';
      const known = l && hljs.getLanguage(l);
      const html = known ? hljs.highlight(text, { language: l, ignoreIllegals: true }).value : escape(text);
      return `<div class="code"><div class="code-bar"><span>${escape(l || 'code')}</span><button type="button" class="copy-code">Copy</button></div><pre><code class="hljs">${html}</code></pre></div>`;
    },
    link({ text }) {
      // Links are not clickable in the overlay (keeps focus where it is).
      return `<span class="link">${text}</span>`;
    },
  },
});

/** Markdown → sanitised HTML. Model output can echo on-screen text, so always sanitise. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'img', 'iframe', 'form', 'input'], FORBID_ATTR: ['style'] });
}
