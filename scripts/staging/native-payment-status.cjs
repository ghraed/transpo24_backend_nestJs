const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const {root,runtime,assertRuntime}=require('./environment.cjs');assertRuntime();
const Stripe=require('stripe');const {PrismaService}=require('../../dist/src/prisma/prisma.service');
const fixture=JSON.parse(fs.readFileSync(path.join(runtime,'native-payment-fixtures.json'),'utf8'));
const purpose=process.argv[2];const action=process.argv[3]||'status';const item=fixture.requests.find(r=>r.purpose===purpose);
if(!item || !['status','kill-before','watch-kill-after'].includes(action))throw new Error('Select an owned native payment fixture and supported action');
const prisma=new PrismaService();const stripe=new Stripe(process.env.STRIPE_TEST_SECRET_KEY,{timeout:10000,maxNetworkRetries:0});
async function inspect(){
 const hold=await prisma.paymentHold.findUnique({where:{requestId:item.requestId}});
 const request=await prisma.transportRequest.findUniqueOrThrow({where:{id:item.requestId},select:{status:true,assignedDriverId:true,acceptedOfferId:true}});
 const result={observedAt:new Date().toISOString(),purpose,requestId:item.requestId,requestStatus:request.status,assigned:Boolean(request.assignedDriverId),paymentHoldPresent:Boolean(hold),confirmationState:hold?.confirmationState,appPaymentStatus:hold?.status,stripeAccountId:hold?.stripeAccountId,stripePaymentIntentId:hold?.stripePaymentIntentId,authorizedAt:hold?.authorizedAt,approvalDeadlineAt:hold?.approvalDeadlineAt};
 if(hold?.stripePaymentIntentId){
  const intent=await stripe.paymentIntents.retrieve(hold.stripePaymentIntentId,{},hold.stripeAccountId?{stripeAccount:hold.stripeAccountId}:undefined);
  if(intent.livemode)throw new Error('Live provider object refused');
  Object.assign(result,{providerStatus:intent.status,providerAmount:intent.amount,providerAmountCapturable:intent.amount_capturable,providerAmountReceived:intent.amount_received,providerLivemode:intent.livemode});
 }
 return result;
}
(async()=>{
 let result;let previous='';
 const deadline=Date.now()+(action==='watch-kill-after'?90000:1);
 do{
  result=await inspect();const status=result.providerStatus||result.confirmationState||'UNSTARTED';
  if(status!==previous){console.log(purpose+': '+status);previous=status;}
  if(action!=='watch-kill-after'||result.providerStatus==='requires_capture')break;
  await new Promise(r=>setTimeout(r,500));
 }while(Date.now()<deadline);
 if(action==='kill-before' && result.providerStatus!=='requires_action')throw new Error('Before-provider termination requires an observed pending authentication');
 if(action==='watch-kill-after' && result.providerStatus!=='requires_capture')throw new Error('Provider authorization success was not observed within the bounded watch');
 if(action!=='status'){
  cp.execFileSync('adb',['-s','7925f75a','shell','am','force-stop','com.transpo24.app.staging'],{stdio:'ignore'});
  result.appForceStoppedAt=new Date().toISOString();result.terminationPoint=action==='kill-before'?'before_provider_success':'after_observed_provider_authorization';
 }
 const phase=action==='status'?'status-'+Date.now():action;
 fs.writeFileSync(path.join(root,'docs/release-2026-11-05/evidence/'+purpose+'-'+phase+'.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
})().catch(()=>{console.error('Native TEST payment probe failed; no provider secrets/error bodies printed.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
