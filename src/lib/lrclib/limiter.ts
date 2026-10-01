/**
 * Semáforo simple: como máximo `limit` tareas a la vez. Se comparte entre todas las
 * importaciones para que dos playlists importándose a la vez no dupliquen la carga a LRCLIB.
 */
export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const g = globalThis as unknown as { __lrclibLimiter?: Limiter };
export const lrclibLimiter = (g.__lrclibLimiter ??= new Limiter(3));
