import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database, Row } from '../db.js';
import { execute, rows } from '../db.js';
import type { Config } from '../config.js';
import { authenticate, codeDigest, createSession, emailValid,
 passwordHash, passwordValid, passwordVerify, sha256 } from '../identity.js';
import { walletStatus } from '../wallet.js';
import { consumeRegistrationCode } from '../registration.js';
import { sendVerificationCode } from '../email.js';

interface ExistingUser extends Row {id:string;email:string;password_hash:string;role:'admin'|'user';}
const throttleCode = {config:{rateLimit:{max:3,timeWindow:'1 hour'}}};
const throttleLogin = {config:{rateLimit:{max:8,timeWindow:'15 minutes'}}};

async function checkTurnstile(token:unknown,config:Config,ip:string):Promise<boolean> {
 if(typeof token!=='string'||token.length<8||token.length>2048)return false;
 try {
  const body=new URLSearchParams({secret:config.turnstileSecret,response:token,remoteip:ip});
  const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
   {method:'POST',body,signal:AbortSignal.timeout(6000)});
  const d=await r.json() as {success?:boolean};
  return r.ok&&d.success===true;
 }catch{return false;}
}
function obj(value:unknown):Record<string,unknown> {
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
export async function requireIdentity(db:Database,req:FastifyRequest,reply:FastifyReply) {
 const user=await authenticate(db,req.headers.authorization);
 if(!user){reply.code(401).send({error:'AUTH_REQUIRED'});return null;}
 return user;
}
export function registerAuth(app:FastifyInstance,db:Database,config:Config) {
 app.get('/api/auth/options',async()=>({registration:config.allowRegistration,recovery:config.allowRecovery,payments:config.paymentsEnabled}));
 app.post('/api/auth/send-code',throttleCode,async(req,reply)=>{
  if(!config.allowRegistration)return reply.code(503).send({error:'REGISTRATION_DISABLED'});
  const body=obj(req.body),email=String(body.email??'').trim().toLowerCase();
  if(!emailValid(email))return reply.code(400).send({error:'INVALID_EMAIL'});
  if(!await checkTurnstile(body.turnstileToken,config,req.ip))return reply.code(403).send({error:'CHALLENGE_REQUIRED'});
  const [existing]=await rows<ExistingUser>(db,'SELECT id FROM users WHERE email=? LIMIT 1',[email]);
  if(existing)return {sent:true};
  // Limit resending the same address across rotating IPs; avoid mailbox harassment.
  const [recent]=await rows(db,
   'SELECT id FROM email_codes WHERE email=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 60 SECOND) LIMIT 1',
   [email]);
  if(recent)return {sent:true};
  const code=String(randomInt(100000,1000000));
  await execute(db,'INSERT INTO email_codes(id,email,code_digest,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))',
   [randomUUID(),email,codeDigest(email,code,config.otpSecret)]);
  try {
   await sendVerificationCode(config,email,code,'registration');
  }catch{
   return reply.code(503).send({error:'EMAIL_DELIVERY_FAILED'});
  }
  return {sent:true};
 });
 app.post('/api/auth/register',throttleLogin,async(req,reply)=>{
  if(!config.allowRegistration)return reply.code(503).send({error:'REGISTRATION_DISABLED'});
  const b=obj(req.body),email=String(b.email??'').trim().toLowerCase();
  const password=b.password,code=b.code;
  if(!emailValid(email)||!passwordValid(password)||typeof code!=='string'||!/^[0-9]{6}$/.test(code)) {
   return reply.code(400).send({error:'INVALID_REGISTRATION'});
  }
  const hash=await passwordHash(password);
  try {
   const userId=randomUUID();
   const accepted=await consumeRegistrationCode(db,email,code,config.otpSecret,userId,hash);
   if(!accepted)return reply.code(400).send({error:'INVALID_CODE_OR_EMAIL'});
   return reply.code(201).send(await createSession(db,userId));
  }catch{return reply.code(400).send({error:'INVALID_CODE_OR_EMAIL'});}
 });
 app.post('/api/auth/login',throttleLogin,async(req,reply)=>{
  const b=obj(req.body),email=String(b.email??'').trim().toLowerCase();
  if(!emailValid(email)||typeof b.password!=='string')return reply.code(401).send({error:'BAD_CREDENTIALS'});
  const [user]=await rows<ExistingUser>(db,
   'SELECT id,email,password_hash,role FROM users WHERE email=? AND is_disabled=0 LIMIT 1',[email]);
  if(!user||!await passwordVerify(user.password_hash,b.password))return reply.code(401).send({error:'BAD_CREDENTIALS'});
  return createSession(db,user.id,config.sessionHours);
 });
 app.post('/api/auth/logout',async(req,reply)=>{
  const user=await requireIdentity(db,req,reply);
  if(!user)return;
  const auth=req.headers.authorization!;
  await execute(db,'DELETE FROM sessions WHERE token_hash=? AND user_id=?',[sha256(auth.slice(7)),user.id]);
  return {ok:true};
 });
 app.get('/api/auth/me',async(req,reply)=>{
  const user=await requireIdentity(db,req,reply);
  if(!user)return;
  return {user,wallet:await walletStatus(db,user.id,config.freePerDay)};
 });
 app.get('/api/account/ledger',async(req,reply)=>{
  const user=await requireIdentity(db,req,reply);
  if(!user)return;
  return {entries:await rows(db,
   'SELECT delta,kind,reference_id,created_at FROM credit_ledger WHERE user_id=? ORDER BY id DESC LIMIT 100',[user.id])};
 });
 app.get('/api/account/jobs',async(req,reply)=>{
  const user=await requireIdentity(db,req,reply);
  if(!user)return;
  return {jobs:await rows(db,
   "SELECT id,filename,source,expires_at,created_at FROM processing_jobs "+
   "WHERE user_id=? AND state='complete' AND expires_at>UTC_TIMESTAMP(3) ORDER BY created_at DESC LIMIT 20",
   [user.id])};
 });
 app.get('/api/account/orders',async(req,reply)=>{
  const user=await requireIdentity(db,req,reply);
  if(!user)return;
  return {orders:await rows(db,
   'SELECT id,title_snapshot,price_fen,credits_snapshot,state,created_at,paid_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[user.id])};
 });
}
