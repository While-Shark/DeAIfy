import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { readConfig } from './config.js';
import { openDb } from './db.js';
import { registerAuth } from './routes/auth.js';
import { registerAdmin } from './routes/admin.js';
import { registerBilling } from './routes/billing.js';
import { registerProcessing } from './routes/processing.js';
import { staleReservations } from './wallet.js';
import { sweepResults } from './image/results.js';

const config=readConfig();
const db=openDb(config);
await db.query('SELECT 1');
const app=Fastify({
 logger:{redact:['req.headers.authorization','req.headers.cookie','req.body.password','req.body.code','req.body.hash']},
 bodyLimit:1024*1024,requestTimeout:60_000,trustProxy:1,
});
await app.register(cors,{origin:config.frontendOrigin,methods:['GET','POST','PUT','OPTIONS'],
 allowedHeaders:['Authorization','Content-Type','Idempotency-Key'],credentials:false});
await app.register(rateLimit,{max:100,timeWindow:'1 minute'});
app.addHook('onSend',async(_req,reply,payload)=>{
 reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff')
  .header('Referrer-Policy','no-referrer').header('X-Frame-Options','DENY');
 return payload;
});
app.get('/health',async()=>({ok:true,service:'deaify-api'}));
registerAuth(app,db,config);
registerBilling(app,db,config);
registerAdmin(app,db,config);
await registerProcessing(app,db,config);

const clean=async()=>{
 try{await staleReservations(db);await sweepResults(config);}
 catch(error){app.log.error({error},'Background quota/result cleanup failed');}
};
const timer=setInterval(()=>void clean(),5*60_000);
timer.unref();
void clean();
app.addHook('onClose',async()=>{clearInterval(timer);await db.end();});
await app.listen({host:'0.0.0.0',port:config.port});
