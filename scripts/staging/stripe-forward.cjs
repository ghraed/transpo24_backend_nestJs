// Official CLI, TEST mode only, local forwarding. No Dashboard endpoint deployment.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {runtime,assertRuntime}=require('./environment.cjs');
const config=assertRuntime();
if(config.STRIPE_TEST_SECRET_KEY==='sk_test_isolated_unconfigured')throw new Error('Authenticated explicit TEST key required');
const cli='/tmp/transpo24-stripe-cli/stripe';
const configFile=path.join(runtime,'stripe-cli.toml');
if(!fs.existsSync(configFile))fs.writeFileSync(configFile,'',{mode:0o600});
const events='payment_intent.amount_capturable_updated,payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,charge.refunded,charge.dispute.created,charge.dispute.updated,charge.dispute.closed,account.updated';
const children=[];const ready=new Set();
let stopping=false;
function failed(scope, code) {
 if(stopping)return;stopping=true;process.exitCode=1;
 console.error('Stripe TEST '+scope+' listener stopped unexpectedly ('+String(code)+'); forwarding is NOT READY. No credentials printed.');
 for(const child of children)child.kill('SIGTERM');
}
for(const scope of ['platform','connect']) {
 const route=scope==='platform'?'stripe':'stripe/connect';
 const args=['--config',configFile,'--project-name','transpo24-staging-'+scope,'--device-name','transpo24-staging-'+scope+'-20261105','--color','off','listen','--events-from',scope==='platform'?'@self':'@accounts','--events',events,'--forward-to','http://127.0.0.1:57430/webhooks/'+route];
 if(scope==='connect')args.push('--forward-connect-to','http://127.0.0.1:57430/webhooks/stripe/connect');
 const child=spawn(cli,args,{env:{PATH:process.env.PATH,HOME:os.homedir(),STRIPE_API_KEY:config.STRIPE_TEST_SECRET_KEY,STRIPE_DEVICE_NAME:'transpo24-staging-'+scope+'-20261105',STRIPE_NO_AUTO_UPDATE:'1'},stdio:['ignore','pipe','pipe']});
 children.push(child);
 let buffer='';
 function handle(data) {
  buffer+=data.toString();
  const lines=buffer.split(/[\r\n]+/);buffer=lines.pop().slice(-2048);
  for(const line of lines) {
  const secret=line.match(/whsec_[A-Za-z0-9]+/);
  if(secret && !ready.has(scope)) {
   const file=path.join(runtime,'environment.json');const current=JSON.parse(fs.readFileSync(file,'utf8'));
   current[scope==='platform'?'STRIPE_TEST_WEBHOOK_SECRET':'STRIPE_TEST_CONNECT_WEBHOOK_SECRET']=secret[0];
   fs.writeFileSync(file,JSON.stringify(current,null,2),{mode:0o600});
   ready.add(scope);console.log('STRIPE_TEST_FORWARDER_READY: '+scope+'; signing secret stored privately.');
   if(ready.size===2) {
    const a=JSON.parse(fs.readFileSync(file,'utf8'));
    console.log('Both TEST listeners ready. Independent CLI signing secrets: '+(a.STRIPE_TEST_WEBHOOK_SECRET!==a.STRIPE_TEST_CONNECT_WEBHOOK_SECRET)+'. Restart the local API with the new private secrets.');
   }
  }
   const status=line.match(/\[(\d{3})\].*POST/);
   if(status)console.log('WEBHOOK_FORWARD_HTTP_STATUS: '+scope+' '+status[1]);
  }
 }
 child.stdout.on('data',handle);child.stderr.on('data',handle);
 child.on('error',()=>failed(scope,'start error'));
 child.on('exit',(code,signal)=>failed(scope,signal||code));
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;for(const child of children)child.kill('SIGTERM');});
