import { randomUUID } from 'node:crypto';
import { readConfig } from '../config.js';
import { openDb, rows, tx } from '../db.js';
import { addUser, emailValid, passwordHash, passwordValid } from '../identity.js';

const email=process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
if(!emailValid(email)||!passwordValid(password)||password.length<16){
 console.error('Provide BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (16+ characters)');
 process.exit(1);
}
const db=openDb(readConfig());
try {
 const existing=await rows(db,'SELECT id FROM users WHERE email=? LIMIT 1',[email]);
 if(existing.length)throw new Error('This email already exists; refusing role escalation');
 const id=randomUUID(),hash=await passwordHash(password);
 await tx(db,conn=>addUser(conn,id,email,hash,'admin'));
 console.log('Admin account created. Clear bootstrap password from your environment.');
}catch(error){
 console.error(error instanceof Error?error.message:'Bootstrap failed');
 process.exitCode=1;
}finally{await db.end();}
