import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { Connection, Database, Row } from './db.js';
import { execute, rows } from './db.js';

export interface Identity { id: string; email: string; role: 'user' | 'admin'; }
export function passwordValid(value: unknown): value is string {
 return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}
export function emailValid(value: unknown): value is string {
 return typeof value === 'string' && value.length <= 191 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export const randomToken = (): string => randomBytes(32).toString('hex');
export function codeDigest(email: string, code: string, secret: string): string {
 return createHmac('sha256', secret).update(email.toLowerCase() + ':' + code).digest('hex');
}
export function compareDigest(left: string, right: string): boolean {
 return /^[a-f\d]{64}$/i.test(left) && /^[a-f\d]{64}$/i.test(right) &&
   timingSafeEqual(Buffer.from(left,'hex'), Buffer.from(right,'hex'));
}
export async function passwordHash(value: string): Promise<string> {
 return argon2.hash(value, { type: argon2.argon2id, memoryCost: 19456, timeCost: 3, parallelism: 1 });
}
export async function passwordVerify(hash: string, password: string): Promise<boolean> {
 try { return await argon2.verify(hash,password); } catch { return false; }
}
export async function createSession(db: Database, userId: string, hours = 24) {
 const secret = randomToken();
 const expiresAt = new Date(Date.now() + hours * 3600_000);
 await execute(db,'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',
   [sha256(secret),userId,expiresAt]);
 return { token: secret, expiresAt: expiresAt.toISOString() };
}
export async function authenticate(db: Database, bearer: unknown): Promise<Identity | null> {
 if (typeof bearer !== 'string' || !/^Bearer [a-f\d]{64}$/i.test(bearer)) return null;
 const result=await rows<Row & Identity>(db,
   "SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id "+
   "WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND u.is_disabled=0 LIMIT 1",
   [sha256(bearer.slice(7))]);
 if (!result.length) return null;
 return {id:result[0]!.id,email:result[0]!.email,role:result[0]!.role};
}
export async function addUser(conn:Connection,id:string,email:string,hash:string,role:'user'|'admin'='user') {
 await execute(conn,'INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)',[id,email,hash,role]);
 await execute(conn,'INSERT INTO wallets(user_id,credits) VALUES(?,0)',[id]);
}
