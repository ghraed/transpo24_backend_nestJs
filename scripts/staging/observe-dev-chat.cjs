const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const assert=require('node:assert/strict');
const {root,runtime,assertRuntime}=require('./environment.cjs');assertRuntime();
const {PrismaService}=require('../../dist/src/prisma/prisma.service');const {io}=require(path.join(root,'../client_mobile/node_modules/socket.io-client'));
const db=new PrismaService();const f=JSON.parse(fs.readFileSync(path.join(runtime,'dev-chat-fixture.json'),'utf8'));const family=crypto.randomUUID();
const label=process.argv[2]||'http';assert.ok(['http','websocket'].includes(label));
const record={label,startedAt:new Date().toISOString(),scope:label==='websocket'?'direct real AppModule recipient WebSocket observer; native sender WebSocket fault tested separately':'direct real AppModule recipient socket observer; sender remains native Dev over faulted HTTP fallback',roomId:f.roomId,events:[]};let socket;let stopping=false;let timer;
const output=path.join(root,'docs/release-2026-11-05/evidence/'+(label==='websocket'?'dev-native-chat-websocket-events.json':'dev-native-chat-events.json'));
const save=()=>fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n');
async function stop(){if(stopping)return;stopping=true;clearTimeout(timer);socket?.disconnect();await db.refreshSession.updateMany({where:{id:family},data:{revokedAt:new Date()}});record.stoppedAt=new Date().toISOString();record.observerSessionRevoked=true;save();await db.$disconnect();}
(async()=>{
 const user=await db.user.findUniqueOrThrow({where:{id:f.customerId}});assert.equal(user.email,'staging-customer@example.invalid');
 await db.refreshSession.create({data:{id:family,familyId:family,userId:user.id,tokenHash:crypto.randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+3600000)}});
 fs.writeFileSync(path.join(runtime,label==='http'?'dev-observer-session.json':'dev-observer-session-websocket.json'),JSON.stringify({family,userId:user.id}),{mode:0o600});
 const encoded=Buffer.from(JSON.stringify({sub:user.id,email:user.email,name:user.name,role:user.role,hasDriverProfile:false,sessionFamily:family,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');const token=encoded+'.'+crypto.createHmac('sha256',process.env.ACCESS_TOKEN_SECRET).update(encoded).digest('base64url');
 socket=io('http://127.0.0.1:57430',{transports:['websocket'],auth:{token},reconnection:false});
 socket.on('chat.message.created',message=>{if(message.chatRoomId!==f.roomId)return;record.events.push({observedAt:new Date().toISOString(),messageId:message.id,operationId:message.operationId,type:message.type,bodySha256:crypto.createHash('sha256').update(message.body||'').digest('hex')});save();});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Observer connection timeout')),10000);socket.once('connect',()=>{clearTimeout(t);resolve()});socket.once('connect_error',()=>{clearTimeout(t);reject(Error('Observer connection failed'))});});
 await socket.timeout(10000).emitWithAck('chat.join',{roomId:f.roomId});record.joinedAt=new Date().toISOString();save();console.log('DEV_CHAT_OBSERVER_READY: authenticated synthetic recipient joined actual room; no token printed.');timer=setTimeout(()=>void stop(),20*60000);
})().catch(async()=>{record.error='Observer setup failed; no secrets printed';save();process.exitCode=1;await stop();});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void stop());
