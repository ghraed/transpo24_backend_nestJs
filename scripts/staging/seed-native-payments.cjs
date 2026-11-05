// Financial eligibility fixtures only; no payment hold/authorization is seeded.
const {runtime,assertRuntime}=require('./environment.cjs');
assertRuntime();
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const Stripe=require('stripe');const {PrismaService}=require('../../dist/src/prisma/prisma.service');
const prisma=new PrismaService();
(async()=>{
 const file=path.join(runtime,'native-payment-fixtures.json');if(fs.existsSync(file))throw new Error('Existing native payment fixtures preserved; cleanup before reseeding.');
 const stripe=new Stripe(process.env.STRIPE_TEST_SECRET_KEY,{timeout:15000,maxNetworkRetries:0});
 const account=JSON.parse(fs.readFileSync(path.join(runtime,'stripe-test-account.json'),'utf8')).accountId;
 const run=crypto.randomUUID();
 const customer=await prisma.user.findUniqueOrThrow({where:{email:'staging-customer@example.invalid'}});
 if(customer.stripeCustomerId)throw new Error('Existing synthetic customer provider link preserved; explicit cleanup required.');
 const record={run,customerId:customer.id,accountId:account,requests:[]};
 const save=()=>fs.writeFileSync(file,JSON.stringify(record,null,2),{mode:0o600});
 const providerCustomer=await stripe.customers.create({name:'Synthetic Transpo24 native acceptance',metadata:{fixture:'transpo24-native-20261105',run}});
 record.stripeCustomerId=providerCustomer.id;save();
 const method=await stripe.paymentMethods.attach('pm_card_authenticationRequired',{customer:providerCustomer.id});
 record.paymentMethodId=method.id;save();
 await stripe.customers.update(providerCustomer.id,{invoice_settings:{default_payment_method:method.id}});
 await prisma.user.update({where:{id:customer.id},data:{stripeCustomerId:providerCustomer.id}});
 const driver=await prisma.driverProfile.update({where:{userId:(await prisma.user.findUniqueOrThrow({where:{email:'staging-driver@example.invalid'}})).id},data:{stripeAccountId:account,stripeDetailsSubmitted:true,stripePayoutsEnabled:true,status:'APPROVED',isProfileCompleted:true}});
 await prisma.driverAvailability.upsert({where:{driverId:driver.id},update:{isOnline:true},create:{driverId:driver.id,timezone:'Europe/Zurich',serviceRadiusKm:50,isOnline:true,baseLatitude:47.5596,baseLongitude:7.5886,baseAddress:'Synthetic base'}});
 const vehicle=await prisma.driverVehicle.create({data:{driverId:driver.id,vehicleType:'VAN',make:'Synthetic',model:'Acceptance',year:2026,plateNumber:'STAGING-'+run.slice(0,8),capacityKg:2000,lengthCm:300,widthCm:200,heightCm:200,allowedCargoTypes:['GOODS'],isActive:true,status:'APPROVED',isDefaultLoadProfile:true}});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 const relative='uploads/driver-documents/staging-vehicle-'+run+'.png';fs.mkdirSync(path.dirname(path.join(runtime,relative)),{recursive:true});fs.writeFileSync(path.join(runtime,relative),png);
 for(const type of ['VEHICLE_FRONT_PHOTO','VEHICLE_REAR_PHOTO','VEHICLE_SIDE_PHOTO','VEHICLE_LICENSE_PLATE_PHOTO','VEHICLE_REGISTRATION_FRONT','VEHICLE_REGISTRATION_BACK','VEHICLE_INSURANCE_DOCUMENT']) await prisma.driverDocument.create({data:{driverId:driver.id,vehicleId:vehicle.id,type,url:'/'+relative,mimeType:'image/png',sizeBytes:png.length,status:'APPROVED'}});
 const service=await prisma.service.findUniqueOrThrow({where:{key:'GOODS_TRANSPORT'}});
 for(const purpose of ['native-3ds-approve','native-3ds-cancel','native-kill-before-provider','native-kill-after-provider']) {
  const request=await prisma.transportRequest.create({data:{customerId:customer.id,serviceId:service.id,status:'QUOTED',isImmediate:true,itemTitle:'SYNTHETIC '+purpose,itemType:'GOODS',goodsDescription:'Synthetic isolated native payment acceptance',goodsApproximateWeightKg:1,goodsNumberOfPieces:1,goodsShipmentSize:'XS',itemWeightKg:1,currency:'CHF',pickupAddress:'Synthetic Basel pickup',dropoffAddress:'Synthetic Basel delivery',pickupLatitude:47.5596,pickupLongitude:7.5886,dropoffLatitude:47.56,dropoffLongitude:7.59,submittedAt:new Date()}});
  const offer=await prisma.driverOffer.create({data:{requestId:request.id,driverId:driver.id,price:10,currency:'CHF',status:'PENDING',estimatedPickupAt:new Date(Date.now()+3600000),estimatedDeliveryAt:new Date(Date.now()+7200000)}});
  record.requests.push({purpose,requestId:request.id,offerId:offer.id});save();
 }
 console.log('Prepared four unaccepted native payment fixtures and a new Stripe TEST-only synthetic customer/card. No authorization, capture, transfer or real funds used. Driver/document eligibility is seeded and does not prove onboarding acceptance.');
})().catch(e=>{console.error(String(e.message).replace(/(?:sk|pk)_(?:test|live)_[^\s]+/g,'[key omitted]'));process.exitCode=1;}).finally(()=>prisma.$disconnect());
