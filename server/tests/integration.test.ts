import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql, { type Pool } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execute, rows } from '../src/db.js';
import { addUser } from '../src/identity.js';
import { createPendingOrder, applyXunhuNotification } from '../src/orders.js';
import { signXunhu } from '../src/payments/xunhu.js';
import { createSession, passwordHash, passwordVerify, codeDigest } from '../src/identity.js';
import { consumeRegistrationCode } from '../src/registration.js';
import { applyRecovery, prepareRecovery } from '../src/recovery.js';
import { reserve, reverse, walletStatus } from '../src/wallet.js';

let db: Pool;
const mysqlTest = process.env.TEST_MYSQL_HOST ? describe : describe.skip;
mysqlTest('real MySQL transaction and replay protection',()=>{
 beforeAll(async()=>{
  db=mysql.createPool({
   host:process.env.TEST_MYSQL_HOST,
   port:Number(process.env.TEST_MYSQL_PORT??3306),
   user:process.env.TEST_MYSQL_USER, password:process.env.TEST_MYSQL_PASSWORD,
   database:process.env.TEST_MYSQL_DATABASE, multipleStatements:true,
   dateStrings:['DATE'], timezone:'Z', connectionLimit:12,
  });
  const schema=await readFile(new URL('../sql/schema.sql',import.meta.url),'utf8');
  await db.query(schema);
 });
 afterAll(async()=>{await db?.end();});
 async function createUser() {
  const id=randomUUID();
  await execute(db,'INSERT INTO users(id,email,password_hash) VALUES(?,?,?)',
   [id,id+'@example.test','dummy-hash-not-for-auth']);
  await execute(db,'INSERT INTO wallets(user_id,credits) VALUES(?,2)',[id]);
  return id;
 }
 it('allows 5 daily free plus 2 paid, never overspends under concurrency, then reverses exactly once',async()=>{
  const userId=await createUser();
  const attempted=await Promise.allSettled(
   Array.from({length:8},()=>reserve(db,userId,randomUUID(),5)));
  const success=attempted.filter(x=>x.status==='fulfilled').map(x=>(x as PromiseFulfilledResult<Awaited<ReturnType<typeof reserve>>>).value);
  expect(success).toHaveLength(7);
  expect(attempted.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect(await walletStatus(db,userId,5)).toMatchObject({freeRemaining:0,credits:0});
  const paid=success.find(x=>x.source==='credits')!;
  expect(await reverse(db,userId,paid.jobId)).toBe(true);
  expect(await reverse(db,userId,paid.jobId)).toBe(false);
  expect((await walletStatus(db,userId,5)).credits).toBe(1);
  const ledgers=await rows(db,'SELECT delta,kind FROM credit_ledger WHERE user_id=?',[userId]);
  expect(ledgers.filter(x=>x.kind==='reversal')).toHaveLength(1);
 });
 it('only grants credits once for duplicate OD and reverses once for duplicate CD',async()=>{
  const userId=await createUser();
  const order=await createPendingOrder(db,userId,'plan-starter');
  const data={appid:'merchant1',trade_order_id:order.id,total_fee:'9.90',
   transaction_id:'platform-tx-123',status:'OD',time:'1770000000',nonce_str:'abc'};
  const secret='test-app-secret';
  expect(await applyXunhuNotification(db,{...data,hash:signXunhu(data,secret)},'merchant1',secret)).toBe('credited');
  expect(await applyXunhuNotification(db,{...data,hash:signXunhu(data,secret)},'merchant1',secret)).toBe('duplicate');
  expect((await walletStatus(db,userId)).credits).toBe(22);
  const refund={...data,status:'CD'};
  expect(await applyXunhuNotification(db,{...refund,hash:signXunhu(refund,secret)},'merchant1',secret)).toBe('refunded');
  expect(await applyXunhuNotification(db,{...refund,hash:signXunhu(refund,secret)},'merchant1',secret)).toBe('duplicate_refund');
  expect((await walletStatus(db,userId)).credits).toBe(2);
  await expect(applyXunhuNotification(db,{...data,total_fee:'99.90',hash:signXunhu({...data,total_fee:'99.90'},secret)},'merchant1',secret))
   .rejects.toThrow('Order / price mismatch');
 });
 it('recovers a password with an 8-digit code and revokes every old session',async()=>{
  const userId=await createUser();
  const email=userId+'@example.test',code='24681357';
  const otpSecret='test-reset-secret-long-enough-for-ci-only';
  expect(await prepareRecovery(db,email,code,otpSecret)).toBe(true);
  expect(await prepareRecovery(db,email,code,otpSecret)).toBe(false);
  const oldSession=await createSession(db,userId);
  expect(oldSession.token).toHaveLength(64);
  const newHash=await passwordHash('new-long-password-for-ci-2026');
  expect(await applyRecovery(db,email,'11111111',newHash,otpSecret)).toBe(false);
  expect(await applyRecovery(db,email,code,newHash,otpSecret)).toBe(true);
  const [user]=await rows(db,'SELECT password_hash FROM users WHERE id=?',[userId]);
  expect(await passwordVerify(user!.password_hash,newHash)).toBe(false);
  expect(await passwordVerify(user!.password_hash,'new-long-password-for-ci-2026')).toBe(true);
  const sessions=await rows(db,'SELECT token_hash FROM sessions WHERE user_id=?',[userId]);
  expect(sessions).toHaveLength(0);
  expect(await applyRecovery(db,email,code,newHash,otpSecret)).toBe(false);
 });

 it('blocks guessed reset codes after five failures and disabled accounts',async()=>{
  const userId=await createUser();
  const email=userId+'@example.test',otpSecret='another-long-reset-secret-for-ci';
  expect(await prepareRecovery(db,email,'99991111',otpSecret)).toBe(true);
  const hash=await passwordHash('new-account-password-1234');
  for(let i=0;i<5;i++){
   expect(await applyRecovery(db,email,'00000000',hash,otpSecret)).toBe(false);
  }
  expect(await applyRecovery(db,email,'99991111',hash,otpSecret)).toBe(false);
  await execute(db,'UPDATE users SET is_disabled=1 WHERE id=?',[userId]);
  expect(await prepareRecovery(db,email,'22223333',otpSecret)).toBe(false);
 });

 it('limits registration code guesses, then permits a new valid code exactly once',async()=>{
  const email=randomUUID()+'@example.test';
  const secret='registration-ci-hmac-key-long-enough';
  const id=randomUUID();
  const hash=await passwordHash('long-register-password-ci-2026');
  const oldCode='112233';
  await execute(db,
   'INSERT INTO email_codes(id,email,code_digest,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))',
   [randomUUID(),email,codeDigest(email,oldCode,secret)]);
  for(let i=0;i<5;i++){
   expect(await consumeRegistrationCode(db,email,'000000',secret,id,hash)).toBe(false);
  }
  expect(await consumeRegistrationCode(db,email,oldCode,secret,id,hash)).toBe(false);
  const code='334455';
  await execute(db,
   'INSERT INTO email_codes(id,email,code_digest,expires_at,created_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 SECOND))',
   [randomUUID(),email,codeDigest(email,code,secret)]);
  expect(await consumeRegistrationCode(db,email,code,secret,id,hash)).toBe(true);
  expect(await consumeRegistrationCode(db,email,code,secret,randomUUID(),hash)).toBe(false);
  const users=await rows(db,'SELECT id FROM users WHERE email=?',[email]);
  expect(users).toHaveLength(1);
 });

});
