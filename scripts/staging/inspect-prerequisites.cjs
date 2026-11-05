// Reports presence and non-secret identifiers only. Does not load dotenv into this process.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { root } = require('./environment.cjs');
const workspace = path.dirname(root);
const result = { checkedOn: '2026-11-05', scope: 'local presence inventory plus dated hosted metadata/permission/receipt evidence; billing/Maps restrictions/APNs not verified', repositories: {} };
for (const repo of ['api','client_mobile','driver_mobile']) {
  const dir = path.join(workspace, repo);
  const env = {};
  const sources = {};
  for (const name of ['.env','.env.local','.env.stripe-production.local']) {
    const file = path.join(dir,name); if (!fs.existsSync(file)) continue;
    for (const [key,value] of Object.entries(parseEnv(fs.readFileSync(file,'utf8')))) { env[key]=value; sources[key]=name; }
  }
  const names = repo === 'api' ? ['GOOGLE_MAPS_SERVER_API_KEY','GOOGLE_ROUTES_API_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_VERIFY_SERVICE_SID','STRIPE_TEST_SECRET_KEY','STRIPE_TEST_WEBHOOK_SECRET','STRIPE_TEST_CONNECT_WEBHOOK_SECRET','EXPO_ACCESS_TOKEN','GOOGLE_APPLICATION_CREDENTIALS'] : ['EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY','EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY','EXPO_ANDROID_STAGING_GOOGLE_SERVICES_FILE','EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE','EXPO_PUBLIC_EAS_PROJECT_ID','EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY'];
  const variables = {};
  for (const key of names) {
    const value = env[key]?.trim();
    const state = !value ? 'MISSING' : /replace_|your_|example|<.*>/.test(value) ? 'PLACEHOLDER' : 'PRESENT_SCOPE_UNVERIFIED';
    variables[key] = { state, ...(sources[key] ? { source: sources[key] } : {}) };
  }
  const firebaseFiles = [];
  for (const name of fs.readdirSync(dir).filter(n=>/^google-services.*\.json$/.test(n))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
    const packages = (data.client || []).map(c=>c.client_info?.android_client_info?.package_name).filter(Boolean);
    firebaseFiles.push({ file: name, projectId: data.project_info?.project_id || null, packages, includesStaging: packages.some(p=>p.endsWith('.staging')) });
  }
  let easProjectIdInAppConfig = false;
  const appFile = path.join(dir, 'app.json');
  if (fs.existsSync(appFile)) easProjectIdInAppConfig = Boolean(JSON.parse(fs.readFileSync(appFile,'utf8')).expo?.extra?.eas?.projectId);
  result.repositories[repo] = { variables, firebaseFiles, easProjectIdInAppConfig };

}
result.notes = ['An EAS projectId may be present in app.json even when its env variable is absent.', 'Driver native Stripe publishable configuration is not required: the driver app uses backend Stripe Connect links.', 'An iOS Firebase plist is not itself a prerequisite for Expo/APNs notifications; APNs and Apple signing are.', 'EXPO_ACCESS_TOKEN is required only if enhanced Expo push security is enabled.'];
result.prerequisites = {
  stagingMaps: 'Existing key strings are not proof of Maps SDK/Places/Routes enablement, billing or staging certificate/IP restrictions. Owner confirmation required before using them.',
  stagingFirebase: 'Checked-in developer files are not staging evidence. Validated private staging files and exact artifact configuration are recorded below when present.',
  pushCredentials: 'Read hosted metadata and actual receipt evidence below; configuration and successful token registration are not device delivery. APNs/signing remain absent.',
  sms: 'Local Twilio credential strings exist, but staging account/service ownership, trial/geo permissions and a user-controlled test destination have not been supplied. No SMS sent.',
  stripe: 'Platform TEST strings exist; separate TEST Connect webhook secret missing locally. Local staging ingress currently uses generated local signing secrets and cannot receive provider deliveries until a TEST-only forwarder is configured.',
  androidSigning: 'Fresh local staging APK signatures and fingerprints are recorded in the mobile evidence directories. Restrict approved staging Maps keys to those package/certificate pairs before rebuilding. Store signing not used.',
  ios: 'Linux host has no Xcode. Apple team, staging bundle IDs/profiles, APNs, registered physical iPhone and signed staging artifacts not available in this session.',
};
const privateRuntime = path.join(root, '.staging-local/environment.json');
if (fs.existsSync(privateRuntime)) {
 const env=JSON.parse(fs.readFileSync(privateRuntime,'utf8'));
 result.isolatedRuntime={stripeMode:env.STRIPE_MODE,realTestKeyLoaded:env.STRIPE_TEST_SECRET_KEY!=='sk_test_isolated_unconfigured',platformSigningSecretPresent:Boolean(env.STRIPE_TEST_WEBHOOK_SECRET),connectSigningSecretPresent:Boolean(env.STRIPE_TEST_CONNECT_WEBHOOK_SECRET),independentEndpointSigningSecrets:env.STRIPE_TEST_WEBHOOK_SECRET!==env.STRIPE_TEST_CONNECT_WEBHOOK_SECRET,mapsServerConfigured:Boolean(env.GOOGLE_MAPS_SERVER_API_KEY),syntheticReviewLoginEnabled:Boolean(env.PLAY_REVIEW_PHONE_NUMBER),smsProviderConfigured:env.TWILIO_AUTH_TOKEN!=='unconfigured',pushEnvironment:env.PUSH_ENVIRONMENT};
 if(result.isolatedRuntime.realTestKeyLoaded) result.prerequisites.stripe='Existing explicit TEST key authenticated and copied privately. Official CLI TEST listeners forward platform/Connect events locally. CLI returns the same signing secret for both scopes; independent deployed endpoint credentials remain unverified. Native authorization/3DS/interruption and actual provider delivery outcomes are recorded separately in DEVICE_RELEASE_CHECKLIST.md; configuration presence alone is not acceptance.';
}
// Reconcile later scoped evidence without printing private key or client config values.
const readEvidence = name => {
 const file=path.join(root,'docs/release-2026-11-05/evidence',name);
 return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
};
result.stagingAndroidFirebase=readEvidence('staging-firebase-configs.json');
result.approvedExpoAssignment=readEvidence('expo-fcm-assignment-result.json');
result.existingKeyValidateOnly=readEvidence('existing-google-key-staging-fcm-preflight.json');
result.stagingTokenRegistration=['customer','driver'].map(role=>readEvidence('push-registration-'+role+'.json')).filter(Boolean);
result.latestSourceApiProgress=readEvidence('fcm-source-api-enabled-owner-progress.json');
result.latestApiPushRetries=['push-customer-background-403ed250-6d42-47cd-b2d5-a88ac75c5b16.json','push-driver-background-0c1c3dfa-adde-4147-b1cd-f7b2c4ae633f.json'].map(readEvidence).filter(Boolean);
result.prerequisites.pushCredentials='Source API enabled: SERVICE_DISABLED cleared. Both genuine API retries now fail FCM403 IAM_PERMISSION_DENIED / cloudmessaging.messages.create / projects/transpo24; Expo currently targets key source project rather than transpo24-staging. Direct target validate-only200 is separate. Owner explicitly requires the existing key; replacement-key request canceled. A supported target-project route for Expo remains unresolved. No new credential changes in retry phase; APNs/signing/lifecycle delivery remain open.';
console.log(JSON.stringify(result,null,2));
