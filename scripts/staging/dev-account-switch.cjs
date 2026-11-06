// Controlled identity fixtures use only the authorized review number and .invalid users.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runtime,assertRuntime}=require('./environment.cjs');assertRuntime();const {PrismaService}=require('../../dist/src/prisma/prisma.service');const db=new PrismaService();
const file=path.join(runtime,'dev-account-switch.json');const action=process.argv[2];
(async()=>{
 let f=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
 if(action==='prepare'){
  assert.ok(!f,'Existing identity fixture preserved');const payments=JSON.parse(fs.readFileSync(path.join(runtime,'native-payment-fixtures.json')));const a=await db.user.findUniqueOrThrow({where:{id:payments.customerId}});assert.equal(a.email,'staging-customer@example.invalid');assert.equal(a.phoneNumber,process.env.PLAY_REVIEW_PHONE_NUMBER);
  const b=await db.user.upsert({where:{email:'staging-customer-b@example.invalid'},update:{},create:{name:'Synthetic Customer B',email:'staging-customer-b@example.invalid',passwordHash:crypto.randomBytes(32).toString('hex'),phoneNumber:null,role:'CUSTOMER',isProfileCompleted:true,countryCode:'US'}});
  const prior=await db.transportRequest.findUniqueOrThrow({where:{id:payments.requests.find(r=>r.purpose==='native-dev-capture').requestId}});const keys=['serviceId','isImmediate','itemType','goodsDescription','goodsApproximateWeightKg','goodsNumberOfPieces','goodsShipmentSize','itemWeightKg','currency','pickupAddress','dropoffAddress','pickupLatitude','pickupLongitude','dropoffLatitude','dropoffLongitude'];const data=Object.fromEntries(keys.map(k=>[k,prior[k]]));
  const request=await db.transportRequest.create({data:{...data,customerId:b.id,status:'DRAFT',itemTitle:'SYNTHETIC Customer B ownership boundary',submittedAt:new Date()}});
  f={customerA:a.id,customerB:b.id,requestB:request.id,originalPhoneA:a.phoneNumber,originalPhoneB:null,active:'a'};fs.writeFileSync(file,JSON.stringify(f,null,2),{mode:0o600});
 }else if(['customer-a','customer-b','restore'].includes(action)){
  assert.ok(f);const a=await db.user.findUniqueOrThrow({where:{id:f.customerA}}),b=await db.user.findUniqueOrThrow({where:{id:f.customerB}});assert.equal(a.email,'staging-customer@example.invalid');assert.equal(b.email,'staging-customer-b@example.invalid');assert.ok([null,process.env.PLAY_REVIEW_PHONE_NUMBER].includes(a.phoneNumber));assert.ok([null,process.env.PLAY_REVIEW_PHONE_NUMBER].includes(b.phoneNumber));
  const toB=action==='customer-b';await db.$transaction(async tx=>{await tx.user.updateMany({where:{id:{in:[a.id,b.id]}},data:{phoneNumber:null}});await tx.user.update({where:{id:toB?b.id:a.id},data:{phoneNumber:process.env.PLAY_REVIEW_PHONE_NUMBER}});});f.active=toB?'b':'a';fs.writeFileSync(file,JSON.stringify(f,null,2),{mode:0o600});
 }else throw Error('Use prepare, customer-a, customer-b, restore');
 console.log(JSON.stringify({customerA:f.customerA,customerB:f.customerB,requestB:f.requestB,active:f.active,scope:'isolated synthetic identities; only authorized review number; no SMS/contact/provider mutation'}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
