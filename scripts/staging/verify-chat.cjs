const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { root,runtime,assertRuntime } = require('./environment.cjs');
assertRuntime();
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const prisma = new PrismaService();
(async()=>{
 const control=JSON.parse(fs.readFileSync(path.join(runtime,'ack-loss.json'),'utf8'));
 assert.equal(control.responseDeliberatelyDropped,true);
 const rows=await prisma.chatMessage.findMany({where:{chatRoomId:control.roomId},select:{id:true,operationId:true,createdAt:true}});
 const same=rows.filter(r=>r.operationId===control.operationId);
 assert.equal(same.length,1);assert.equal(same[0].id,control.messageId);
 const label=process.argv[2] || 'observed';
 if(!/^[a-z-]+$/.test(label))throw new Error('Invalid evidence label');
 const result={observedAt:new Date().toISOString(),phase:label,...control,operationRowCount:same.length,totalRoomMessages:rows.length,rows};
 fs.writeFileSync(path.join(root,'docs/release-2026-11-05/evidence/staging-chat-'+label+'.json'),JSON.stringify(result,null,2)+'\n');
 console.log(`PASS ${label}: exactly one committed row for the deliberately unacknowledged operation; room has ${rows.length} message(s).`);
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
