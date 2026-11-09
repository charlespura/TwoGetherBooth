import { createHmac, randomBytes } from 'node:crypto';
import type { IceServer } from '@twogether/protocol';
const urls = (value: string | undefined) =>
  value
    ?.split(',')
    .map((x) => x.trim())
    .filter(Boolean) ?? [];
export function iceServers(env: NodeJS.ProcessEnv = process.env, now = Date.now): IceServer[] {
  const stun = urls(env.STUN_URLS ?? 'stun:stun.l.google.com:19302');
  const turn = urls(env.TURN_URLS);
  const servers: IceServer[] = stun.length ? [{ urls: stun }] : [];
  if (turn.length && env.TURN_SHARED_SECRET) {
    const ttl = Number(env.TURN_TTL_SECONDS ?? 10800);
    const username = `${Math.floor(now() / 1000) + ttl}:${randomBytes(12).toString('hex')}`;
    const credential = createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64');
    servers.push({ urls: turn, username, credential });
  }
  return servers;
}
