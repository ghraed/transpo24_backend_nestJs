// Read-only protection snapshot. Never requests signing/key material or mutations.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { parseEnv } = require('node:util');
const root = path.resolve(__dirname, '../..');
const snapshotFile = path.join(root, '.staging-local/production-local-protection.json');
const publicFile = path.join(root, 'docs/release-2026-11-05/evidence/production-local-protection.json');
const scopes = [
  { name: '@raed.gh/transpo24', id: 'd3e62d2e-cc21-4c2a-afb8-9b05f492c725', stage: 'com.transpo24.app.staging' },
  { name: '@raed.gh/driver_mobile', id: '9adb6313-42fb-4399-b3ea-6e040805a8a4', stage: 'com.transpo24.driver.staging' },
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
function localFiles() {
  const rows=[];
  for (const repo of ['api','client_mobile','driver_mobile','admin','transpo24-public-site']) {
    const dir=path.join(root,'..',repo);
    for (const name of fs.readdirSync(dir).filter(n=>/^\.env(?:\..*)?$/.test(n)||/^google-services.*\.json$/.test(n)||['GoogleService-Info.plist','app.json','app.config.ts','app.config.js','eas.json','package.json','package-lock.json'].includes(n))) {
      const file=path.join(dir,name);if(fs.statSync(file).isFile()) rows.push({file,sha256:hash(fs.readFileSync(file))});
    }
  }
  const env=parseEnv(fs.readFileSync(path.join(root,'.env'),'utf8'));
  const credential=path.resolve(root,env.GOOGLE_APPLICATION_CREDENTIALS);
  for(const file of [credential,...['environment.json','compose.env','firebase/customer-google-services.json','firebase/driver-google-services.json'].map(f=>path.join(root,'.staging-local',f))]) rows.push({file,sha256:hash(fs.readFileSync(file))});
  return canonical(rows);
}
async function hosted() {
  const cli=path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'eas-cli/build');
  if(require(path.join(cli,'api')).getExpoApiBaseUrl()!=='https://api.expo.dev')throw Error('Official endpoint required');
  const SessionManager=require(path.join(cli,'user/SessionManager')).default;
  const session=new SessionManager(undefined);
  const client=require(path.join(cli,'commandUtils/context/contextUtils/createGraphqlClient')).createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
  // Deliberately omit AndroidKeystore.keystore/passwords and every jsonKey field.
  const query=`query ProtectCredentialMetadata($name:String!){app{byFullName(fullName:$name){id androidAppCredentials(filter:{legacyOnly:false}){id applicationIdentifier isLegacy androidFcm{id} googleServiceAccountKeyForFcmV1{id projectIdentifier} googleServiceAccountKeyForSubmissions{id projectIdentifier} androidAppBuildCredentialsList{id isDefault isLegacy name androidKeystore{id type sha1CertificateFingerprint sha256CertificateFingerprint}}}}}}`;
  const protectedRows=[],stagingFcm=[];
  for(const scope of scopes){
    const r=await client.query(query,{name:scope.name},{noRetry:true,requestPolicy:'network-only'}).toPromise();
    if(r.error||r.data?.app?.byFullName?.id!==scope.id)throw Error('Metadata lookup/scope mismatch');
    const records=r.data.app.byFullName.androidAppCredentials;
    const stage=records.filter(a=>a.applicationIdentifier===scope.stage);
    if(stage.length!==1)throw Error('One existing staging record required');
    stagingFcm.push({projectId:scope.id,applicationIdentifier:scope.stage,key:stage[0].googleServiceAccountKeyForFcmV1});
    // ONLY the FCM V1 binding on the exact two staging records is mutable.
    const protectedRecords=records.map(a=>a.applicationIdentifier===scope.stage?{...a,googleServiceAccountKeyForFcmV1:'ALLOWED_STAGING_FCM_REPLACEMENT'}:a);
    protectedRows.push({projectId:scope.id,records:protectedRecords});
  }
  return {protectedMetadata:canonical(protectedRows),stagingFcm:canonical(stagingFcm)};
}
async function main(){
  const mode=process.argv[2];if(!['snapshot','verify'].includes(mode))throw Error('Use snapshot or verify');
  if(mode==='snapshot'&&fs.existsSync(snapshotFile))throw Error('Existing protection snapshot preserved; use verify');
  const current={checkedAt:new Date().toISOString(),localFiles:localFiles(),...await hosted()};
  let result={checkedAt:current.checkedAt,mode,readOnly:true,keyMaterialRequested:false,mutationsPerformed:false,localConfigFilesChecked:current.localFiles.length,protectedHostedMetadataHash:hash(JSON.stringify(current.protectedMetadata)),allowedChanges:scopes.map(s=>({expoProjectId:s.id,applicationIdentifier:s.stage,field:'googleServiceAccountKeyForFcmV1'})),queriedNonlegacyAndroidCredentialRecordsProtected:true,queriedAndroidSigningAndSubmissionBindingsProtected:true,coverageNote:'Two Expo projects, nonlegacy Android credential records only; iOS and other Expo projects were not queried.',existingLocalGoogleKeyProtected:true,stagingFcm:current.stagingFcm};
  if(mode==='snapshot')fs.writeFileSync(snapshotFile,JSON.stringify(current,null,2),{mode:0o600});
  else {const before=JSON.parse(fs.readFileSync(snapshotFile,'utf8'));result.localConfigsUnchanged=JSON.stringify(before.localFiles)===JSON.stringify(current.localFiles);result.protectedHostedMetadataUnchanged=JSON.stringify(before.protectedMetadata)===JSON.stringify(current.protectedMetadata);if(!result.localConfigsUnchanged||!result.protectedHostedMetadataUnchanged)throw Error('Protected settings changed; stop');}
  fs.writeFileSync(publicFile,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
if(require.main===module)main().catch(()=>{console.error('Production/local protection check failed; no private values printed. Stop credential changes.');process.exitCode=1});
module.exports={canonical};
