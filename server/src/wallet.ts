import { randomUUID } from 'node:crypto';
import type { Database, Row } from './db.js';
import { execute, rows, tx } from './db.js';
export function beijingDay(now: Date = new Date()): string {
 return new Date(now.getTime()+8*3600_000).toISOString().slice(0,10);
}
interface Wallet extends Row { credits:number|string; }
interface Quota extends Row {used:number;}
interface Job extends Row {
 id:string;user_id:string;source:'free'|'credits';state:'reserved'|'complete'|'reversed';
 quota_date:Date|string;filename:string;mime:string;byte_count:number;expires_at:Date|null;
}
export function validIdempotency(key:unknown): key is string {
 return typeof key==='string' && /^[a-zA-Z0-9_-]{16,80}$/.test(key);
}
export async function walletStatus(db:Database,userId:string,perDay=5) {
 const today=beijingDay();
 const [wallet]=await rows<Wallet>(db,'SELECT credits FROM wallets WHERE user_id=?',[userId]);
 const [quota]=await rows<Quota>(db,'SELECT used FROM daily_quota WHERE user_id=? AND quota_date=?',[userId,today]);
 return {credits:Number(wallet?.credits??0),freeRemaining:Math.max(0,perDay-(quota?.used??0)),perDay,day:today};
}
export async function reserve(db:Database,userId:string,key:string,perDay=5) {
 if(!validIdempotency(key)) throw new Error('Invalid idempotency key');
 return tx(db,async conn=>{
  const [wallet]=await rows<Wallet>(conn,'SELECT credits FROM wallets WHERE user_id=? FOR UPDATE',[userId]);
  if(!wallet)throw new Error('Wallet missing');
  const [existing]=await rows<Job>(conn,'SELECT * FROM processing_jobs WHERE user_id=? AND idempotency_key=?',[userId,key]);
  if(existing)return {jobId:existing.id,existingState:existing.state,source:existing.source};
  const day=beijingDay();
  await execute(conn,'INSERT IGNORE INTO daily_quota(user_id,quota_date,used) VALUES(?,?,0)',[userId,day]);
  const [quota]=await rows<Quota>(conn,'SELECT used FROM daily_quota WHERE user_id=? AND quota_date=? FOR UPDATE',[userId,day]);
  const free=(quota?.used??0)<perDay;
  if(!free&&Number(wallet.credits)<1)throw new Error('NO_CREDITS');
  const jobId=randomUUID();
  if(free)await execute(conn,'UPDATE daily_quota SET used=used+1 WHERE user_id=? AND quota_date=?',[userId,day]);
  else {
   await execute(conn,'UPDATE wallets SET credits=credits-1 WHERE user_id=?',[userId]);
   await execute(conn,"INSERT INTO credit_ledger(user_id,delta,kind,reference_id) VALUES(?,-1,'consume',?)",[userId,jobId]);
  }
  await execute(conn,'INSERT INTO processing_jobs(id,user_id,idempotency_key,source,quota_date) VALUES(?,?,?,?,?)',
    [jobId,userId,key,free?'free':'credits',day]);
  return {jobId,existingState:null,source:free?'free':'credits'};
 });
}
export async function finalize(db:Database,userId:string,jobId:string,filename:string,mime:string,bytes:number){
 return tx(db,async conn=>{
  const [job]=await rows<Job>(conn,'SELECT * FROM processing_jobs WHERE id=? AND user_id=? FOR UPDATE',[jobId,userId]);
  if(!job||job.state!=='reserved')throw new Error('Job cannot be finalized');
  await execute(conn,
   "UPDATE processing_jobs SET state='complete',filename=?,mime=?,byte_count=?,expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) WHERE id=?",
   [filename,mime,bytes,jobId]);
 });
}
export async function reverse(db:Database,userId:string,jobId:string) {
 return tx(db,async conn=>{
  await rows<Wallet>(conn,'SELECT credits FROM wallets WHERE user_id=? FOR UPDATE',[userId]);
  const [job]=await rows<Job>(conn,'SELECT * FROM processing_jobs WHERE id=? AND user_id=? FOR UPDATE',[jobId,userId]);
  if(!job||job.state!=='reserved')return false;
  if(job.source==='free')await execute(conn,
   'UPDATE daily_quota SET used=GREATEST(0,used-1) WHERE user_id=? AND quota_date=?',[userId,job.quota_date]);
  else {
   await execute(conn,'UPDATE wallets SET credits=credits+1 WHERE user_id=?',[userId]);
   await execute(conn,"INSERT INTO credit_ledger(user_id,delta,kind,reference_id) VALUES(?,1,'reversal',?)",[userId,jobId]);
  }
  await execute(conn,"UPDATE processing_jobs SET state='reversed' WHERE id=?",[jobId]);
  return true;
 });
}
export async function jobForDownload(db:Database,userId:string,jobId:string) {
 const [job]=await rows<Job>(db,
  "SELECT * FROM processing_jobs WHERE id=? AND user_id=? AND state='complete' AND expires_at>UTC_TIMESTAMP(3)",
  [jobId,userId]);
 return job??null;
}
export async function staleReservations(db:Database) {
 const jobs=await rows<Job>(db,
  "SELECT id,user_id FROM processing_jobs WHERE state='reserved' AND created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) LIMIT 50");
 for(const job of jobs)await reverse(db,job.user_id,job.id);
}
