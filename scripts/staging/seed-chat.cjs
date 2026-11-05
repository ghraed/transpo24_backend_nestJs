// This seed establishes chat eligibility only. It is not bank/booking acceptance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const { hashPassword } = require('../../dist/src/common/security/password.util');
const { runtime, assertRuntime } = require('./environment.cjs');
assertRuntime();
const prisma = new PrismaService();
(async()=>{
 await prisma.$connect();
 const phone='+12025550111';
 const driverUser=await prisma.user.upsert({where:{email:'staging-driver@example.invalid'},update:{},create:{name:'Synthetic Driver',email:'staging-driver@example.invalid',passwordHash:hashPassword(crypto.randomUUID()),role:'DRIVER',driverProfile:{create:{firstName:'Synthetic',lastName:'Driver',phone,countryCode:'CH'}}}});
 await prisma.user.update({where:{id:driverUser.id},data:{phoneNumber:null}});
 const driver=await prisma.driverProfile.update({where:{userId:driverUser.id},data:{status:'APPROVED',isProfileCompleted:true}});
 const customer=await prisma.user.upsert({where:{email:'staging-customer@example.invalid'},update:{phoneNumber:phone},create:{name:'Synthetic Customer',email:'staging-customer@example.invalid',phoneNumber:phone,countryCode:'CH',passwordHash:hashPassword(crypto.randomUUID()),role:'CUSTOMER'}});
 const service=await prisma.service.upsert({where:{key:'GOODS_TRANSPORT'},update:{},create:{key:'GOODS_TRANSPORT',nameEn:'Synthetic Goods',nameAr:'Synthetic Goods',descriptionEn:'Acceptance seed',descriptionAr:'Acceptance seed',icon:'box',sortOrder:1}});
 const request=await prisma.transportRequest.create({data:{customerId:customer.id,serviceId:service.id,status:'DRIVER_ASSIGNED',assignedDriverId:driver.id,isImmediate:true,itemTitle:'SYNTHETIC CHAT ONLY — NOT A BANK AUTHORIZATION',pickupAddress:'Synthetic pickup',dropoffAddress:'Synthetic delivery',pickupLatitude:47.5596,pickupLongitude:7.5886,dropoffLatitude:47.56,dropoffLongitude:7.59}});
 const offer=await prisma.driverOffer.create({data:{requestId:request.id,driverId:driver.id,price:10,currency:'CHF',status:'ACCEPTED',acceptedAt:new Date()}});
 await prisma.transportRequest.update({where:{id:request.id},data:{acceptedOfferId:offer.id}});
 await prisma.paymentHold.create({data:{requestId:request.id,customerId:customer.id,driverId:driver.id,acceptedOfferId:offer.id,amount:10,currency:'CHF',paymentMethod:'APP_WALLET',provider:'APP_WALLET',status:'PAYMENT_HELD',capturedAt:new Date(Date.now()-20*60000),metadata:{syntheticChatEligibilityOnly:true}}});
 const room=await prisma.chatRoom.create({data:{transportRequestId:request.id,clientId:customer.id,driverId:driver.id,acceptedOfferId:offer.id}});
 fs.writeFileSync(path.join(runtime,'chat-fixture.json'),JSON.stringify({phone,customerId:customer.id,driverUserId:driverUser.id,driverId:driver.id,requestId:request.id,roomId:room.id},null,2),{mode:0o600});
 console.log('Synthetic chat eligibility seed created in dedicated staging DB. No actual bank authorization or wallet funding is claimed.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
