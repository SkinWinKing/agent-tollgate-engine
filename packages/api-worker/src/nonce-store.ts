import { DurableObject } from 'cloudflare:workers';

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class NonceStore extends DurableObject {
  async consume(key: string, ttlSec: number): Promise<boolean> {
    const now = Date.now();
    const existing = await this.ctx.storage.get<number>(key);
    if (existing !== undefined && existing > now) return false;
    await this.ctx.storage.put(key, now + ttlSec * 1000);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    return true;
  }

  async hit(key: string, limit: number, ttlSec: number): Promise<boolean> {
    const now = Date.now();
    const current = await this.ctx.storage.get<{ n: number; exp: number }>(key);
    const bucket = current && current.exp > now ? current : { n: 0, exp: now + ttlSec * 1000 };
    if (bucket.n >= limit) return false;
    await this.ctx.storage.put(key, { n: bucket.n + 1, exp: bucket.exp });
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
    return true;
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const entries = await this.ctx.storage.list<number | { n: number; exp: number }>();
    const expiry = (v: number | { n: number; exp: number }) => (typeof v === 'number' ? v : v.exp);
    const expired = [...entries].filter(([, v]) => expiry(v) <= now).map(([k]) => k);
    for (let i = 0; i < expired.length; i += 128) await this.ctx.storage.delete(expired.slice(i, i + 128));
    if (entries.size > expired.length) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
  }
}
