// Genuine isolated HTTP/DB/socket observer check. This is NOT native process acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { root, runtime, assertRuntime } = require('./environment.cjs');
assertRuntime();
const base = 'http://127.0.0.1:57431';
const controlFile = path.join(runtime, 'ack-loss.json');
const replayFile = path.join(runtime, 'http-chat-replay-private.json');
async function send(input) {
  let body; const headers = { authorization: 'Bearer ' + input.token };
  if (input.kind === 'text') {
    headers['content-type'] = 'application/json';
    body = JSON.stringify({ operationId: input.operationId, body: input.body });
  } else {
    body = new FormData(); body.set('operationId', input.operationId);
    body.set('file', new Blob([Buffer.from(input.bytes, 'base64')], { type: 'image/png' }), 'synthetic-replay.png');
  }
  const result = await fetch(base + `/chat/rooms/${input.roomId}/${input.kind === 'text' ? 'messages' : 'attachments'}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
  assert.equal(result.status, 201, 'Chat response status');
  return result.json();
}
if (process.argv[2] === '--replay-child') {
  send(JSON.parse(fs.readFileSync(replayFile, 'utf8'))).then(result => console.log(JSON.stringify({ id: result.id, replayed: result.replayed }))).catch(() => { console.error('Replay child failed; no private response printed.'); process.exitCode = 1; });
} else {
  const evidenceName = process.argv[2] || 'resume-chat-http';
  assert.ok(/^[a-z-]+$/.test(evidenceName));
  const { PrismaService } = require('../../dist/src/prisma/prisma.service');
  const { hashPassword } = require('../../dist/src/common/security/password.util');
  const { io } = require(path.join(root, '../client_mobile/node_modules/socket.io-client'));
  const prisma = new PrismaService();
  const families = [];
  let socket; let savedControl;
  const evidence = { observedAt: new Date().toISOString(), scope: 'real HTTP/DB and socket event observation; fresh Node replay process; NOT physical Android acceptance', cases: [] };
  function saveControl(value) { fs.writeFileSync(controlFile, JSON.stringify(value), { mode: 0o600 }); }
  async function session(user) {
    const id = crypto.randomUUID(); families.push(id);
    await prisma.refreshSession.create({ data: { id, familyId: id, userId: user.id, tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const payload = Buffer.from(JSON.stringify({ sub: user.id, name: user.name, email: user.email, role: user.role, hasDriverProfile: user.role === 'DRIVER', sessionFamily: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const token = payload + '.' + crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update(payload).digest('base64url');
    const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    const legal = await (await fetch(base + '/auth/legal', { headers })).json();
    const accepted = await fetch(base + '/auth/legal', { method: 'POST', headers, body: JSON.stringify({ version: legal.version }) });
    assert.equal(accepted.status, 201); return token;
  }
  (async () => {
    savedControl = fs.readFileSync(controlFile);
    const fixture = JSON.parse(fs.readFileSync(path.join(runtime, 'chat-fixture.json'), 'utf8'));
    const customer = await prisma.user.findUniqueOrThrow({ where: { id: fixture.customerId } });
    const driver = await prisma.user.findUniqueOrThrow({ where: { id: fixture.driverUserId } });
    assert.equal(customer.email, 'staging-customer@example.invalid');
    assert.equal(driver.email, 'staging-driver@example.invalid');
    assert.equal(await prisma.pushToken.count({ where: { userId: { in: [customer.id, driver.id] }, isActive: true } }), 0, 'Refuse external push during HTTP-only probe');
    const token = await session(driver); const recipientToken = await session(customer);
    const outsider = await prisma.user.create({ data: { name: 'Synthetic HTTP isolation', email: `staging-http-${crypto.randomUUID()}@example.invalid`, role: 'CUSTOMER', passwordHash: hashPassword(crypto.randomUUID()) } });
    const outsiderToken = await session(outsider);
    socket = io('http://127.0.0.1:57430', { transports: ['websocket'], auth: { token: recipientToken }, reconnection: false });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Socket observer timeout')), 10000); socket.once('connect', () => { clearTimeout(timer); resolve(); }); socket.once('connect_error', () => { clearTimeout(timer); reject(Error('Socket observer connection failed')); }); });
    await socket.timeout(10000).emitWithAck('chat.join', { roomId: fixture.roomId });
    const observed = []; socket.on('chat.message.created', value => observed.push(value));
    const png = await require('sharp')({ create: { width: 3, height: 3, channels: 3, background: '#008866' } }).png().toBuffer();
    for (const kind of ['text', 'attachment']) {
      const input = { token, roomId: fixture.roomId, kind, operationId: crypto.randomUUID(), body: 'Synthetic repeated text; distinct operation identity', bytes: png.toString('base64') };
      const filesBefore = await prisma.requestFile.count({ where: { requestId: fixture.requestId, category: 'CHAT' } });
      saveControl({ armed: true, blocked: false, roomId: fixture.roomId });
      let ackLost = false;
      try { await send(input); } catch { ackLost = true; }
      assert.ok(ackLost, 'Expected dropped response');
      const dropped = JSON.parse(fs.readFileSync(controlFile, 'utf8'));
      assert.equal(dropped.operationId, input.operationId);
      assert.equal(dropped.responseDeliberatelyDropped, true);
      const rows = await prisma.chatMessage.findMany({ where: { chatRoomId: fixture.roomId, operationId: input.operationId } });
      assert.equal(rows.length, 1); assert.equal(rows[0].id, dropped.messageId);
      saveControl({ ...dropped, blocked: false });
      fs.writeFileSync(replayFile, JSON.stringify(input), { mode: 0o600 });
      const replay = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [__filename, '--replay-child'], { env: process.env, cwd: runtime, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', bytes => { output += bytes; });
        child.on('error', reject); child.on('exit', code => { if (code !== 0) reject(Error('Fresh replay process failed')); else { try { resolve(JSON.parse(output)); } catch { reject(Error('Invalid replay summary')); } } });
      });
      assert.equal(replay.id, rows[0].id); assert.equal(replay.replayed, true);
      await new Promise(resolve => setTimeout(resolve, 350));
      assert.equal(observed.filter(value => value.operationId === input.operationId).length, 1, 'Exactly one socket broadcast within observed window');
      assert.equal(await prisma.chatMessage.count({ where: { chatRoomId: fixture.roomId, operationId: input.operationId } }), 1);
      const filesAfter = await prisma.requestFile.count({ where: { requestId: fixture.requestId, category: 'CHAT' } });
      assert.equal(filesAfter - filesBefore, kind === 'attachment' ? 1 : 0);
      const entry = { kind, operationId: input.operationId, messageId: replay.id, rows: 1, socketEvents: 1, observationAfterReplayMs: 350, responseDroppedAfterCommit: true, freshNodeReplayProcess: true, newFiles: filesAfter - filesBefore };
      if (kind === 'text') {
        const second = await send({ ...input, operationId: crypto.randomUUID() });
        assert.notEqual(second.id, replay.id); entry.identicalTextWithNewOperationIsSeparate = true;
        const bad = await fetch(base + `/chat/rooms/${fixture.roomId}/messages`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ operationId: input.operationId, body: 'Conflicting replacement' }) });
        assert.equal(bad.status, 409); entry.conflictingOperationRejected = true;
      } else {
        const headers = { authorization: 'Bearer ' + recipientToken };
        const owned = await fetch(base + rows[0].attachmentUrl, { headers }); assert.equal(owned.status, 200);
        const bytes = Buffer.from(await owned.arrayBuffer());
        const denied = await fetch(base + rows[0].attachmentUrl, { headers: { authorization: 'Bearer ' + outsiderToken } });
        assert.ok([403, 404].includes(denied.status));
        const anonymous = await fetch(base + rows[0].attachmentUrl); assert.equal(anonymous.status, 401);
        entry.privateDocument = { authorizedStatus: 200, outsiderStatus: denied.status, anonymousStatus: 401, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
      }
      evidence.cases.push(entry);
      console.log('PASS scoped full-API ' + kind + ': dropped post-commit response, fresh Node replay, one DB row/event; physical app still pending.');
    }
    evidence.status = 'PASS scoped backend integration; NOT native acceptance';
  })().catch(error => { evidence.status = 'FAIL'; evidence.error = error.message; console.error(error.message); process.exitCode = 1; }).finally(async () => {
    socket?.disconnect();
    if (savedControl) fs.writeFileSync(controlFile, savedControl, { mode: 0o600 });
    if (fs.existsSync(replayFile)) fs.unlinkSync(replayFile);
    await prisma.refreshSession.updateMany({ where: { familyId: { in: families } }, data: { revokedAt: new Date() } });
    evidence.cleanup = {
      generatedSessionsRevoked: await prisma.refreshSession.count({ where: { familyId: { in: families }, revokedAt: { not: null } } }),
      generatedSessionsStillActive: await prisma.refreshSession.count({ where: { familyId: { in: families }, revokedAt: null } }),
      previousFaultControlRestored: savedControl ? fs.readFileSync(controlFile).equals(savedControl) : false,
      privateReplayInputRemoved: !fs.existsSync(replayFile),
    };
    await prisma.$disconnect();
    fs.writeFileSync(path.join(root, 'docs/release-2026-11-05/evidence/resume-chat-http.json'), JSON.stringify(evidence, null, 2) + '\n');
  });
}
