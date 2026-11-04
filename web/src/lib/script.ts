const cache = new Map<string, Promise<void>>();

/** Load an external script once; resolves when it has executed. */
export function loadScript(src: string): Promise<void> {
  const existing = cache.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      cache.delete(src);
      el.remove();
      reject(new Error(`Could not load ${new URL(src).hostname}. Check your connection or ad blocker.`));
    };
    document.head.appendChild(el);
  });
  cache.set(src, p);
  return p;
}
