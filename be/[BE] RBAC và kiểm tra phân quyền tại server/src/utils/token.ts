import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../database/prisma';

type TokenPayload = jwt.JwtPayload & { userId: string; email: string; tokenVersion: number };
export const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export function signAccessToken(payload: { userId: string; email: string; tokenVersion?: number }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'], jwtid: crypto.randomUUID() });
}
export function signRefreshToken(payload: { userId: string; email: string; tokenVersion?: number }) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'], jwtid: crypto.randomUUID() });
}
export function verifyAccessToken(token: string): TokenPayload | null {
  try { return jwt.verify(token, env.JWT_SECRET) as TokenPayload; } catch { return null; }
}
export function verifyRefreshToken(token: string): TokenPayload | null {
  try { return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload; } catch { return null; }
}
export async function revokeToken(token: string, userId?: string) {
  const decoded = jwt.decode(token) as jwt.JwtPayload | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 86400000);
  await prisma.revokedToken.upsert({ where: { tokenHash: hashToken(token) }, create: { tokenHash: hashToken(token), userId, expiresAt }, update: { expiresAt } });
}
export async function isTokenRevoked(token: string) {
  const row = await prisma.revokedToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return false;
  if (row.expiresAt <= new Date()) { await prisma.revokedToken.delete({ where: { id: row.id } }).catch(() => undefined); return false; }
  return true;
}
