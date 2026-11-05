const fs=require('node:fs');const path=require('node:path');
const {root,runtime,assertRuntime}=require('./environment.cjs');assertRuntime();
const Stripe=require('stripe');const {PrismaService}=require('../../dist/src/prisma/prisma.service');
const fixture=JSON.parse(fs.readFileSync(path.join(runtime,'native-payment-fixtures.json'),'utf8'));
const prisma=new PrismaService();const stripe=new Stripe(process.env.STRIPE_TEST_SECRET_KEY,{timeout:15000,maxNetworkRetries:1});
(async()=>{
 const results=[];
 for(const item of fixture.requests){
  const hold=await prisma.paymentHold.findUnique({where:{requestId:item.requestId}});
  if(!hold?.stripePaymentIntentId){results.push({purpose:item.purpose,providerIntentPresent:false});continue;}
  const options=hold.stripeAccountId?{stripeAccount:hold.stripeAccountId}:{};
  let intent=await stripe.paymentIntents.retrieve(hold.stripePaymentIntentId,{},options);
  if(intent.livemode || intent.metadata?.requestId!==item.requestId)throw new Error('Provider cleanup ownership/mode mismatch');
  let action='already_canceled';
  if(intent.status==='succeeded'){
   await stripe.refunds.create({payment_intent:intent.id,...(hold.stripeAccountId?{refund_application_fee:true}:{}),metadata:{fixture:fixture.run}}, {...options,idempotencyKey:fixture.run+'-cleanup-'+intent.id});action='refunded_test_capture';
  }else if(intent.status!=='canceled'){
   intent=await stripe.paymentIntents.cancel(intent.id,{}, {...options,idempotencyKey:fixture.run+'-cleanup-'+intent.id});action='canceled_test_authorization';
  }
  results.push({purpose:item.purpose,paymentIntentId:intent.id,accountId:hold.stripeAccountId,providerLivemode:false,action,providerStatus:intent.status,amountCapturable:intent.amount_capturable,amountReceived:intent.amount_received});
 }
 const record={cleanedAt:new Date().toISOString(),run:fixture.run,results,syntheticProviderCustomerRetained:true,reason:'Preserve TEST-only replay evidence. No live account or financial history deleted.'};
 fs.writeFileSync(path.join(root,'docs/release-2026-11-05/evidence/native-payment-cleanup.json'),JSON.stringify(record,null,2)+'\n');
 console.log('Owned TEST payment cleanup completed; ledger/provider references retained. No live objects or prior connected account modified.');
})().catch(()=>{console.error('Owned TEST payment cleanup failed; do not mark the financial gate closed. No provider secrets/error bodies printed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
