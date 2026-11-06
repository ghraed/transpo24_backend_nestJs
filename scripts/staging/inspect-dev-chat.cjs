const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {root,runtime,assertRuntime}=require('./environment.cjs');assertRuntime();const {PrismaService}=require('../../dist/src/prisma/prisma.service');const db=new PrismaService();
const phase=process.argv[2];assert.ok(/^[a-z-]+$/.test(phase||''));
(async()=>{
 const f=JSON.parse(fs.readFileSync(path.join(runtime,'dev-chat-fixture.json'),'utf8'));const control=JSON.parse(fs.readFileSync(path.join(runtime,'ack-loss.json'),'utf8'));assert.equal(control.roomId,f.roomId);
 const rows=await db.chatMessage.findMany({where:{chatRoomId:f.roomId},select:{id:true,operationId:true,type:true,senderId:true,attachmentUrl:true,body:true,createdAt:true},orderBy:{createdAt:'asc'}});
 const events=JSON.parse(fs.readFileSync(path.join(root,'docs/release-2026-11-05/evidence/'+(['websocket','http-upload-websocket-events'].includes(control.transport)?'dev-native-chat-websocket-events.json':'dev-native-chat-events.json')),'utf8'));
 const matching=rows.filter(row=>row.operationId===control.operationId);assert.equal(matching.length,1);assert.equal(matching[0].id,control.messageId);assert.equal(matching[0].senderId,f.driverId);assert.equal(events.events.filter(event=>event.operationId===control.operationId).length,1);
 if(phase.includes('replay'))assert.equal(control.replaySucceeded,true);
 if(phase.endsWith('identical-new-operation')){
  const same=rows.filter(row=>row.type==='TEXT' && row.body===matching[0].body);assert.equal(same.length,2);assert.equal(new Set(same.map(row=>row.operationId)).size,2);assert.equal(new Set(same.map(row=>row.id)).size,2);for(const row of same)assert.equal(events.events.filter(event=>event.operationId===row.operationId).length,1);
 }
 const files=await db.requestFile.count({where:{requestId:f.requestId,category:'CHAT'}});
 if(phase.includes('attachment-')){assert.equal(files,control.expectedChatFileRows||1);assert.equal(matching[0].type,'FILE');}
 const result={observedAt:new Date().toISOString(),phase,senderApp:'com.transpo24.driver.dev',roomId:f.roomId,requestId:f.requestId,control,operationRows:matching.length,operationEvents:1,chatFileRows:files,totalMessageRows:rows.length,rows:rows.map(({body,...row})=>({...row,bodySha256:crypto.createHash('sha256').update(body||'').digest('hex')})),scope:control.transport==='http-upload-websocket-events'?'actual native Dev HTTP attachment upload with active WebSocket events; successful response and sender event suppressed, actual socket pairs terminated; direct recipient observer':['websocket'].includes(control.transport)?'actual native Dev WebSocket sender; committed ack and sender event suppressed, real proxy sockets closed; direct recipient observer':'actual native Dev sender with HTTP acknowledgment fault; separate direct recipient socket observer; not sender WebSocket acknowledgment-loss acceptance'};
 fs.writeFileSync(path.join(root,'docs/release-2026-11-05/evidence/dev-native-chat-'+phase+'.json'),JSON.stringify(result,null,2)+'\n');console.log('PASS '+phase+': same operation has exactly one committed row and one observed event; '+files+' chat file row(s).');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
