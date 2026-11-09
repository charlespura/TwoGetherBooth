import { z } from 'zod';

export const token = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);
const name = z.string().trim().max(32);
export const settingsSchema = z.object({
  frame: z.enum(['cream', 'rose', 'mono']),
  names: z.string().max(60),
  caption: z.string().max(80),
  date: z.string().max(10),
});
export type StripSettings = z.infer<typeof settingsSchema>;
export const signalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), name }),
  z.object({ type: z.literal('join'), room: token, name }),
  z.object({ type: z.literal('resume'), room: token, peerId: token, key: token }),
  z.object({ type: z.literal('approve'), requestId: token, allow: z.boolean() }),
  z.object({
    type: z.literal('signal'),
    payload: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('description'),
        description: z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(24_000) }),
      }),
      z.object({
        kind: z.literal('candidate'),
        candidate: z.object({
          candidate: z.string().max(2048),
          sdpMid: z.string().max(64).nullable().optional(),
          sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(),
          usernameFragment: z.string().max(256).nullable().optional(),
        }),
      }),
    ]),
  }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientSignal = z.infer<typeof signalSchema>;
export type Relay = Extract<ClientSignal, { type: 'signal' }>['payload'];
export type IceServer = { urls: string[]; username?: string; credential?: string };
export type Membership = {
  room: string;
  peerId: string;
  key: string;
  role: 'host' | 'guest';
  expiresAt: number;
  iceServers: IceServer[];
};
export type ServerSignal =
  | ({ type: 'joined' } & Membership)
  | { type: 'waiting' }
  | { type: 'join-request'; requestId: string; name: string }
  | { type: 'request-gone'; requestId: string }
  | { type: 'peer-ready'; name: string; iceServers: IceServer[] }
  | { type: 'peer-offline' | 'peer-left' | 'room-expired' | 'pong' }
  | { type: 'signal'; payload: Relay }
  | { type: 'error'; code: string; message: string };

const id = z.string().uuid();
export const peerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state'), ready: z.boolean(), camera: z.boolean(), mic: z.boolean() }),
  z.object({ type: z.literal('ping'), t0: z.number().finite() }),
  z.object({ type: z.literal('pong'), t0: z.number().finite(), t1: z.number().finite() }),
  z.object({ type: z.literal('settings'), settings: settingsSchema }),
  z.object({
    type: z.literal('prepare'),
    id,
    target: z.number().finite(),
    settings: settingsSchema,
  }),
  z.object({ type: z.literal('accept'), id }),
  z.object({ type: z.literal('commit'), id }),
  z.object({ type: z.literal('cancel'), id, reason: z.string().max(160) }),
  z.object({ type: z.literal('discard') }),
  z.object({ type: z.literal('received'), id }),
  z.object({
    type: z.literal('file-start'),
    id,
    captureId: id,
    kind: z.enum(['pose', 'result']),
    pose: z.number().int().min(0).max(2),
    size: z.number().int().min(1).max(3_500_000),
    mime: z.enum(['image/jpeg', 'image/png']),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ type: z.literal('file-end'), id }),
]);
export type PeerMessage = z.infer<typeof peerSchema>;
export type FileMeta = Extract<PeerMessage, { type: 'file-start' }>;
export const POSES = 3;
export const POSE_GAP = 3500;
export const MAX_POSE_BYTES = 240_000;
