// Strictly read-only metadata query. Does not enter a credential manager or
// select a build profile; requests no key material and invokes no mutation.
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const globalModules=cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
const cli=path.join(globalModules,'eas-cli/build');
const SessionManager=require(path.join(cli,'user/SessionManager')).default;
const api=require(path.join(cli,'api'));
if(api.getExpoApiBaseUrl()!=='https://api.expo.dev')throw Error('Only the official Expo API is allowed');
const {createGraphqlClient}=require(path.join(cli,'commandUtils/context/contextUtils/createGraphqlClient'));
const session=new SessionManager(undefined);
const auth={accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()};
if(!auth.accessToken&&!auth.sessionSecret)throw Error('Existing Expo login required; this script never initiates login');
const client=createGraphqlClient(auth);
const query=`query StagingPushMetadata($name:String!,$identifier:String!){app{byFullName(fullName:$name){id androidAppCredentials(filter:{applicationIdentifier:$identifier,legacyOnly:false}){applicationIdentifier googleServiceAccountKeyForFcmV1{projectIdentifier}}}}}`;
(async()=>{
 const results=[];
 for(const [repo,fullName,identifier] of [['client_mobile','@raed.gh/transpo24','com.transpo24.app.staging'],['driver_mobile','@raed.gh/driver_mobile','com.transpo24.driver.staging']]){
  const result=await client.query(query,{name:fullName,identifier},{noRetry:true,requestPolicy:'network-only'}).toPromise();
  if(result.error||!result.data?.app?.byFullName)throw Error('Read-only metadata lookup failed');
  const app=result.data.app.byFullName;
  const expected=JSON.parse(fs.readFileSync(path.join(root,'..',repo,'app.json'),'utf8')).expo.extra.eas.projectId;
  if(app.id!==expected)throw Error('Expo project mismatch');
  const records=app.androidAppCredentials; if(records.some(x=>x.applicationIdentifier!==identifier))throw Error('Staging application scope mismatch');
  results.push({repository:repo,projectId:app.id,applicationIdentifier:identifier,credentialRecordPresent:records.length>0,fcmV1Assigned:records.some(x=>Boolean(x.googleServiceAccountKeyForFcmV1)),firebaseProjectIds:records.map(x=>x.googleServiceAccountKeyForFcmV1?.projectIdentifier).filter(Boolean)});
 }
 const evidence={checkedAt:new Date().toISOString(),officialEndpoint:true,metadataOnly:true,keyMaterialRequested:false,mutationsPerformed:false,results};
 fs.writeFileSync(path.join(root,'docs/release-2026-11-05/evidence/expo-staging-push-credentials-readonly.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
})().catch(()=>{console.error('Read-only Expo staging metadata inspection failed; no authentication or response bodies printed.');process.exitCode=1;});
