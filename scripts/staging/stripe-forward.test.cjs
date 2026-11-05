const test=(name,run)=>{run();console.log('PASS '+name);};const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {EventEmitter}=require('node:events');
function fixture(){
 const proc=new EventEmitter();proc.env={PATH:'/fixture'};const children=[];const logs=[];
 const config={STRIPE_TEST_SECRET_KEY:'sk_test_fixture'};
 const fakeFs={existsSync:()=>true,readFileSync:()=>JSON.stringify(config),writeFileSync:(_p,data)=>Object.assign(config,JSON.parse(data))};
 const spawn=()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.signals=[];child.kill=signal=>{child.signals.push(signal);child.emit('exit',null,signal);};children.push(child);return child;};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'stripe-forward.cjs'),'utf8'),{require:name=>{
 if(name==='node:fs')return fakeFs;if(name==='node:path')return path;if(name==='node:os')return {homedir:()=>'/fixture'};if(name==='node:child_process')return {spawn};if(name==='./environment.cjs')return {runtime:'/fixture',assertRuntime:()=>config};throw Error('Unexpected dependency');
 },process:proc,console:{log:s=>logs.push(s),error:s=>logs.push(s)}});
 return {proc,children,logs};
}
for(const code of [0,1])test('unexpected listener exit '+code+' fails the wrapper and stops sibling',()=>{
 const f=fixture();f.children[0].emit('exit',code,null);assert.equal(f.proc.exitCode,1);assert.deepEqual(f.children[1].signals,['SIGTERM']);assert(f.logs.some(s=>s.includes('NOT READY')));
});
test('intentional shutdown stops both listeners without reporting acceptance failure',()=>{
 const f=fixture();f.proc.emit('SIGTERM');assert.notEqual(f.proc.exitCode,1);assert(f.children.every(c=>c.signals.includes('SIGTERM')));assert(!f.logs.some(s=>s.includes('NOT READY')));
});
test('readiness output never includes captured signing secrets',()=>{
 const f=fixture();f.children[0].stdout.emit('data',Buffer.from('Ready whsec_fixtureA\n'));f.children[1].stderr.emit('data',Buffer.from('Ready whsec_fixtureB\n'));assert(f.logs.some(s=>s.includes('Both TEST listeners ready')));assert(!f.logs.some(s=>s.includes('whsec_')));
});
