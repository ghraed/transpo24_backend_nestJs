// Controlled local fault injection. Never proxy another host or log authorization/body content.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { runtime, assertRuntime } = require('./environment.cjs');
const config = assertRuntime();
if (config.PORT !== '57430') throw new Error('Full AppModule must listen on isolated port 57430 before enabling the proxy');
const control = path.join(runtime, 'ack-loss.json');
const sockets = new Set();
function state() { return fs.existsSync(control) ? JSON.parse(fs.readFileSync(control,'utf8')) : {}; }
function save(value) { fs.writeFileSync(control, JSON.stringify(value,null,2), { mode:0o600 }); }
const server = http.createServer((request,response) => {
  const mode = state();
  if (mode.blocked || request.url.startsWith('/socket.io')) { response.writeHead(503); response.end(); return; }
  const chunks=[];
  request.on('data',b=>chunks.push(b));
  request.on('end',() => {
    const body=Buffer.concat(chunks);
    const target=http.request({ host:'127.0.0.1', port:57430, method:request.method, path:request.url, headers:request.headers }, upstream=>{
      const hit = mode.armed && request.method==='POST' && request.url === `/chat/rooms/${mode.roomId}/messages` && upstream.statusCode >= 200 && upstream.statusCode < 300;
      const sameRoom = request.url.split('?')[0] === `/chat/rooms/${mode.roomId}/messages`;
      const stale = mode.hideCommittedOnce && request.method === 'GET' && sameRoom && upstream.statusCode === 200;
      const replay = !hit && request.method === 'POST' && sameRoom && mode.operationId && upstream.statusCode >= 200 && upstream.statusCode < 300;
      if (!hit && !stale && !replay) { response.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(response); return; }
      const reply=[];
      upstream.on('data',b=>reply.push(b));
      upstream.on('end',() => {
        const bytes = Buffer.concat(reply);
        const committed=JSON.parse(bytes.toString('utf8'));
        if (stale) {
          // One explicitly stale history snapshot exercises durable replay rather
          // than allowing history reconciliation to finish the native case first.
          committed.messages = committed.messages.filter(message => message.operationId !== mode.operationId);
          committed.total = committed.messages.length;
          save({ ...state(), hideCommittedOnce:false, staleHistoryServed:true });
          const headers={...upstream.headers};delete headers['content-length'];delete headers.etag;
          response.writeHead(upstream.statusCode,headers);response.end(JSON.stringify(committed));
          console.log('ONE_STALE_HISTORY_RESPONSE_SERVED: synthetic room only; committed database unchanged.');
          return;
        }
        const sent=JSON.parse(body.toString('utf8'));
        const message=committed.message || committed;
        if (replay) {
          if (sent.operationId === mode.operationId && message.id === mode.messageId) {
            save({ ...state(), nativeReplaySucceeded:true, nativeReplayRequests:(state().nativeReplayRequests || 0)+1 });
            console.log('NATIVE_REPLAY_RETURNED_SAME_MESSAGE: operation and persisted message identity match.');
          }
          response.writeHead(upstream.statusCode,upstream.headers);response.end(bytes);return;
        }
        if (!sent.operationId || !message.id) { response.writeHead(502);response.end();return; }
        save({ roomId:mode.roomId, armed:false, blocked:true, operationId:sent.operationId, messageId:message.id, committedResponseStatus:upstream.statusCode, responseDeliberatelyDropped:true });
        // The successful upstream response proves the service returned after commit;
        // a DB probe independently verifies the row before device force-stop.
        for(const socket of sockets) socket.destroy();
        console.log('COMMIT_RESPONSE_DROPPED: isolated synthetic room; network held until explicit unblock.');
      });
    });
    target.on('error',()=>{ if(!response.headersSent) response.writeHead(502);response.end(); });
    target.end(body);
  });
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
server.on('upgrade',(_req,socket)=>socket.destroy()); // Force HTTP fallback, including polling; avoid a second acknowledgement path.
server.listen(57431,'127.0.0.1',()=>console.log('ACK_LOSS_PROXY_READY: loopback only, full backend 57430; sockets deliberately unavailable for this acceptance case.'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{for(const socket of sockets)socket.destroy();server.close(()=>process.exit(0));});
