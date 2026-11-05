require('./environment.cjs').assertRuntime();
const fs=require('node:fs');
const Stripe=require('stripe');
const path=require('node:path');
const {root,runtime}=require('./environment.cjs');
(async()=>{
 if(!process.env.STRIPE_TEST_SECRET_KEY.startsWith('sk_test_') || process.env.STRIPE_TEST_SECRET_KEY==='sk_test_isolated_unconfigured')throw new Error('A real explicitly selected TEST key is required');
 const client=new Stripe(process.env.STRIPE_TEST_SECRET_KEY,{timeout:10000,maxNetworkRetries:0});
 const record=JSON.parse(fs.readFileSync('/tmp/transpo24-remediation/stripe-test-account.json','utf8'));
 const account=await client.accounts.retrieve(record.accountId);
 const {StripeService}=require('../../dist/src/payments/stripe.service');
 await new StripeService().requirePlatformProcessingFees(account.id);
 const result={checkedAt:new Date().toISOString(),stripeMode:'test',authenticated:true,connectedAccountRetrieved:true,chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,detailsSubmitted:account.details_submitted,platformPaysProcessingFees:true,mutationsPerformed:false,providerWebhookForwardingConfigured:false};
 fs.writeFileSync(path.join(root,'docs/release-2026-11-05/evidence/stripe-staging-preflight.json'),JSON.stringify(result,null,2)+'\n');
 fs.writeFileSync(path.join(runtime,'stripe-test-account.json'),JSON.stringify({accountId:account.id}),{mode:0o600});
 console.log('PASS read-only Stripe TEST preflight: key authenticated, prior TEST connected account retrieved; no charges or account changes. Forwarded webhooks and native authorization still need acceptance.');
})().catch(()=>{console.error('Stripe TEST preflight failed; no secrets or provider error bodies printed.');process.exitCode=1;});
