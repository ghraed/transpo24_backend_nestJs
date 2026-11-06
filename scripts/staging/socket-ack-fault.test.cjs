const {test}=require('node:test');const assert=require('node:assert/strict');
const {outgoingOperation,acknowledgment,createdMessage}=require('./socket-ack-fault.cjs');
const op='synthetic-operation-123456';
test('recognizes the actual chat send/ack frames with ack zero and keeps only identities',()=>{
 const sent=outgoingOperation('420'+JSON.stringify(['chat.message.send',{roomId:'owned-room',operationId:op,body:'private test body'}]));assert.deepEqual(sent,{ackId:'0',roomId:'owned-room',operationId:op});
 const ack=acknowledgment('430'+JSON.stringify([{id:'message-1',chatRoomId:'owned-room',operationId:op,body:'private test body',replayed:true}]));assert.deepEqual(ack,{ackId:'0',messageId:'message-1',roomId:'owned-room',operationId:op,replayed:true});assert.ok(!JSON.stringify(ack).includes('private test body'));
});
test('never interprets authentication, unrelated events, malformed data or errors as committed chat',()=>{
 for(const value of ['40{"token":"private-token"}','420["driverLocationUpdate",{}]','420["chat.message.send",{"roomId":"x","operationId":"short"}]','430[{"status":"error"}]','43not-json',null]){assert.equal(outgoingOperation(value),null);assert.equal(acknowledgment(value),null);assert.equal(createdMessage(value),null);}
});
test('recognizes only created-message events and does not retain their content',()=>{
 const event=createdMessage('42'+JSON.stringify(['chat.message.created',{id:'message-1',chatRoomId:'owned-room',operationId:op,body:'private-body'}]));assert.deepEqual(event,{messageId:'message-1',roomId:'owned-room',operationId:op,replayed:false});assert.equal(createdMessage('42["chat.typing",{"roomId":"owned-room"}]'),null);
});
