// Controlled local fault injection. Never proxy another host or log authorization/body content.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { WebSocket, WebSocketServer } = require('ws');
const { outgoingOperation, acknowledgment, createdMessage } = require('./socket-ack-fault.cjs');
const { runtime, assertRuntime } = require('./environment.cjs');
const config = assertRuntime();
if (config.PORT !== '57430') throw new Error('Full AppModule must listen on isolated port 57430 before enabling the proxy');
const control = path.join(runtime, 'ack-loss.json');
const sockets = new Set();
const webSockets = new Set();
function state() { return fs.existsSync(control) ? JSON.parse(fs.readFileSync(control,'utf8')) : {}; }
function save(value) { fs.writeFileSync(control, JSON.stringify(value,null,2), { mode:0o600 }); }
const server = http.createServer((request,response) => {
  const mode = state();
  if (mode.blocked || (mode.forceHttp && request.url.startsWith('/socket.io'))) { response.writeHead(503); response.end(); return; }
  if (request.method === 'GET' && request.url === mode.dropGetPath && /^\/customer\/requests\/[A-Za-z0-9_-]+\/status$/.test(request.url)) {
    save({...state(), droppedGetConnections:(state().droppedGetConnections || 0)+1, droppedGetAt:new Date().toISOString()});
    request.socket.destroy(); return;
  }
  const chunks=[];
  request.on('data',b=>chunks.push(b));
  request.on('end',() => {
    const body=Buffer.concat(chunks);
    const headers = {...request.headers};
    if (mode.bypassConditionalCache && mode.delayPath === '/driver/me' && request.url === mode.delayPath && request.method === 'GET') {
      delete headers['if-none-match']; delete headers['if-modified-since'];
    }
    const target=http.request({ host:'127.0.0.1', port:57430, method:request.method, path:request.url, headers }, upstream=>{
      if (request.method === 'GET' && request.url === mode.observePath && /^\/(?:driver\/jobs|customer\/requests)\/[A-Za-z0-9_-]+(?:\/status)?$/.test(request.url)) {
        save({...state(), observedResponseStatus: upstream.statusCode, observedResponseAt: new Date().toISOString()});
      }
      const paymentHit = mode.armed && request.method==='POST' && request.url===mode.paymentPath && /^\/customer\/requests\/[A-Za-z0-9_-]+\/additional-charges\/[A-Za-z0-9_-]+\/approve$/.test(request.url) && upstream.statusCode>=200 && upstream.statusCode<300;
      if(paymentHit) {
        const bytes=[];upstream.on('data',chunk=>bytes.push(chunk));upstream.on('end',()=>{
          const result=JSON.parse(Buffer.concat(bytes).toString('utf8'));
          save({...state(),armed:false,blocked:true,committedResponseStatus:upstream.statusCode,acknowledgedChargeId:result.id,committedChargeStatus:result.status,responseDeliberatelyDropped:true,actualProxyWebSocketsTerminated:webSockets.size,commitObservedAt:new Date().toISOString()});
          for(const active of webSockets)active.terminate();for(const active of sockets)active.destroy();
          console.log('PAYMENT_COMMIT_RESPONSE_DROPPED: exact synthetic approval route; real connections closed; no payment payload logged.');
        });return;
      }
      const mutation = request.method === 'POST' && ['messages', 'attachments'].some(endpoint => request.url === `/chat/rooms/${mode.roomId}/${endpoint}`);
      const hit = mode.armed && mode.transport !== 'websocket' && mutation && upstream.statusCode >= 200 && upstream.statusCode < 300;
      const sameRoom = request.url.split('?')[0] === `/chat/rooms/${mode.roomId}/messages`;
      const stale = (mode.hideCommittedOnce || mode.hideCommittedUntilReplay) && request.method === 'GET' && sameRoom && upstream.statusCode === 200;
      const replay = !hit && mutation && mode.operationId && upstream.statusCode >= 200 && upstream.statusCode < 300;
      if (!hit && !stale && !replay) {
        const delay = Number(mode.delayResponseMs);
        if(request.method==='GET' && /^(?:\/driver\/me|\/request-files\/[A-Za-z0-9_-]+\/content|\/customer\/requests\/[A-Za-z0-9_-]+\/status)$/.test(request.url) && request.url===mode.delayPath && delay>0 && delay<=60000) {
          save({...state(),delayedRequestStartedAt:new Date().toISOString(),delayedUpstreamStatus:upstream.statusCode});
          setTimeout(()=>{if(response.destroyed){upstream.destroy();save({...state(),delayedResponseAbandonedAt:new Date().toISOString()});return;}response.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(response);save({...state(),delayedResponseReleasedAt:new Date().toISOString()});},delay);return;
        }
        response.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(response); return;
      }
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
        const message=committed.message || committed;
        const sent=request.url.endsWith('/attachments')
          ? { operationId: message.operationId } // Multipart is parsed/validated by the real controller.
          : JSON.parse(body.toString('utf8'));
        if (replay) {
          if (sent.operationId === mode.operationId && message.id === mode.messageId) {
            save({ ...state(), hideCommittedUntilReplay:false, replaySucceeded:true, replayRequests:(state().replayRequests || 0)+1 });
            console.log('REPLAY_RETURNED_SAME_MESSAGE: operation and persisted message identity match; client lifecycle scope is recorded separately.');
          }
          response.writeHead(upstream.statusCode,upstream.headers);response.end(bytes);return;
        }
        if (!sent.operationId || !message.id) { response.writeHead(502);response.end();return; }
        save({ ...state(), endpoint:request.url, roomId:mode.roomId, armed:false, blocked:true, operationId:sent.operationId, messageId:message.id, committedResponseStatus:upstream.statusCode, responseDeliberatelyDropped:true, actualProxyWebSocketsTerminated:webSockets.size });
        for(const active of webSockets)active.terminate();
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
const wsServer = new WebSocketServer({ noServer:true, maxPayload:1024*1024 });
server.on('upgrade',(request,socket,head)=>{
  const mode=state();
  if(mode.blocked || mode.forceHttp || !request.url.startsWith('/socket.io')) { socket.destroy(); return; }
  wsServer.handleUpgrade(request,socket,head,front=>{
    const headers={};for(const key of ['authorization','cookie','origin'])if(request.headers[key])headers[key]=request.headers[key];
    const upstream=new WebSocket('ws://127.0.0.1:57430'+request.url,{headers,maxPayload:1024*1024});
    webSockets.add(front);webSockets.add(upstream);
    const waiting=[];const pending=new Map();let suppressed=0;
    const terminate=()=>{front.terminate();upstream.terminate();};
    front.on('error',terminate);upstream.on('error',terminate);
    front.on('close',()=>{webSockets.delete(front);upstream.terminate();});
    upstream.on('close',()=>{webSockets.delete(upstream);front.terminate();});
    front.on('message',(bytes,binary)=>{
      const operation=binary?null:outgoingOperation(bytes.toString());
      if(operation)pending.set(operation.ackId,operation);
      if(upstream.readyState===WebSocket.OPEN)upstream.send(bytes,{binary});
      else if(waiting.length<32)waiting.push({bytes,binary});else terminate();
    });
    upstream.on('open',()=>{for(const item of waiting)upstream.send(item.bytes,{binary:item.binary});waiting.length=0;console.log('SOCKET_PROXY_CONNECTED: real loopback AppModule; no auth/body data logged.');});
    upstream.on('message',(bytes,binary)=>{
      const current=state();const text=binary?null:bytes.toString();
      const created=createdMessage(text);
      if(current.armed && created?.roomId===current.roomId && ((current.transport==='websocket' && [...pending.values()].some(op=>op.operationId===created.operationId)) || current.transport==='http-upload-websocket-events')) { suppressed++;if(current.transport==='http-upload-websocket-events')save({...current,senderCreatedEventsSuppressed:(current.senderCreatedEventsSuppressed||0)+1});return; }
      const ack=acknowledgment(text);const sent=ack?pending.get(ack.ackId):null;
      if(ack && sent && ack.operationId===sent.operationId && ack.roomId===sent.roomId) {
        pending.delete(ack.ackId);
        if(current.armed && current.transport==='websocket' && ack.roomId===current.roomId && !ack.replayed) {
          const pairs=webSockets.size;
          save({roomId:ack.roomId,transport:'websocket',armed:false,blocked:true,operationId:ack.operationId,messageId:ack.messageId,responseDeliberatelyDropped:true,socketAcknowledgmentDropped:true,senderCreatedEventsSuppressed:suppressed,actualProxyWebSocketsTerminated:pairs,ackPacketId:ack.ackId,commitObservedAt:new Date().toISOString()});
          for(const active of webSockets)active.terminate();
          for(const active of sockets)active.destroy();
          console.log('SOCKET_COMMIT_ACK_DROPPED: committed identity observed; actual proxy WebSockets terminated.');return;
        }
        if(current.operationId===ack.operationId && current.messageId===ack.messageId && ack.replayed) {
          save({...current,hideCommittedUntilReplay:false,replaySucceeded:true,socketReplaySucceeded:true,replayRequests:(current.replayRequests||0)+1});
          console.log('SOCKET_REPLAY_RETURNED_SAME_MESSAGE: original persisted identity; no auth/body logged.');
        }
      }
      if(front.readyState===WebSocket.OPEN)front.send(bytes,{binary});
    });
  });
});
server.listen(57431,'127.0.0.1',()=>console.log('ACK_LOSS_PROXY_READY: loopback only, full backend 57430; normal HTTP/WebSocket transport; explicit scoped fault modes only.'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{for(const socket of sockets)socket.destroy();for(const ws of webSockets)ws.terminate();wsServer.close();server.close(()=>process.exit(0));});
