export type Toast = { id: number; kind: 'ok' | 'error' | 'info'; text: string };

class Toasts {
  items = $state<Toast[]>([]);
  #next = 1;

  push(kind: Toast['kind'], text: string, ms = 4500) {
    const id = this.#next++;
    this.items.push({ id, kind, text });
    setTimeout(() => this.dismiss(id), ms);
  }

  ok(text: string) {
    this.push('ok', text);
  }
  error(text: string) {
    this.push('error', text, 6500);
  }
  info(text: string) {
    this.push('info', text);
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
