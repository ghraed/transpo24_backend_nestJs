const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {runtime,assertRuntime}=require('./environment.cjs');assertRuntime();
const {PrismaService}=require('../../dist/src/prisma/prisma.service');const db=new PrismaService();
(async()=>{
 const f=JSON.parse(fs.readFileSync(path.join(runtime,'native-payment-fixtures.json'),'utf8'));
 const item=f.requests.find(row=>row.purpose==='native-dev-capture');assert.ok(item);
 const hold=await db.paymentHold.findUniqueOrThrow({where:{requestId:item.requestId}});assert.equal(hold.status,'PAYMENT_HELD');assert.ok(hold.stripePaymentIntentId);
 const room=await db.chatRoom.findUniqueOrThrow({where:{transportRequestId:item.requestId}});assert.equal(room.clientId,f.customerId);
 const customer=await db.user.findUniqueOrThrow({where:{id:room.clientId}});assert.equal(customer.email,'staging-customer@example.invalid');
 const driver=await db.driverProfile.findUniqueOrThrow({where:{id:room.driverId},include:{user:true}});assert.equal(driver.user.email,'staging-driver@example.invalid');
 const backup=path.join(runtime,'dev-chat-fault-original.json');assert.ok(!fs.existsSync(backup),'Existing fault backup preserved');
 fs.copyFileSync(path.join(runtime,'ack-loss.json'),backup);fs.chmodSync(backup,0o600);
 fs.writeFileSync(path.join(runtime,'dev-chat-fixture.json'),JSON.stringify({requestId:item.requestId,roomId:room.id,customerId:room.clientId,driverId:driver.id,driverUserId:driver.userId,providerFunding:'actual TEST authorization, no capture'},null,2),{mode:0o600});
 fs.writeFileSync(path.join(runtime,'ack-loss.json'),JSON.stringify({roomId:room.id,armed:false,blocked:false},null,2),{mode:0o600});
 console.log('Prepared native Dev chat fault scope for the actually authorized synthetic booking; original fault controls preserved.');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
