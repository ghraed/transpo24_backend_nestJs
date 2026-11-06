// Inspect only default-namespace Socket.IO chat identity fields, never auth/body data.
function packet(value, kind) {
  if (typeof value !== 'string') return null;
  const match = value.match(new RegExp('^4' + kind + '(\\d{1,12})?(\\[.*\\])$', 's'));
  if (!match) return null;
  try { return { ackId: match[1] ?? null, values: JSON.parse(match[2]) }; } catch { return null; }
}
function identity(value) {
  if (!value || typeof value.id !== 'string' || typeof value.chatRoomId !== 'string' || typeof value.operationId !== 'string') return null;
  return { messageId: value.id, roomId: value.chatRoomId, operationId: value.operationId, replayed: value.replayed === true };
}
function outgoingOperation(value) {
  const p = packet(value, '2');
  if (!p?.ackId || p.values?.[0] !== 'chat.message.send') return null;
  const input = p.values[1];
  if (typeof input?.roomId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(input?.operationId ?? '')) return null;
  return { ackId: p.ackId, roomId: input.roomId, operationId: input.operationId };
}
function acknowledgment(value) {
  const p = packet(value, '3');
  const message = identity(p?.values?.[0]);
  return p?.ackId && message ? { ackId: p.ackId, ...message } : null;
}
function createdMessage(value) {
  const p = packet(value, '2');
  return p?.values?.[0] === 'chat.message.created' ? identity(p.values[1]) : null;
}
module.exports = { outgoingOperation, acknowledgment, createdMessage };
