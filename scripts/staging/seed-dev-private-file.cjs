// An owned draft/file for native read-session races only, never payment/journey acceptance.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { assertRuntime, runtime, root } = require('./environment.cjs'); assertRuntime();
const { PrismaService } = require('../../dist/src/prisma/prisma.service'); const db = new PrismaService();
(async () => {
  const record = path.join(runtime, 'dev-customer-private-file.json'); assert.ok(!fs.existsSync(record), 'Retain existing private-file fixture');
  const f = JSON.parse(fs.readFileSync(path.join(runtime, 'dev-chat-fixture.json')));
  const customer = await db.user.findUniqueOrThrow({ where: { id: f.customerId } }); assert.equal(customer.email, 'staging-customer@example.invalid');
  const pdf = await db.requestFile.findUniqueOrThrow({ where: { id: 'cmw4u4ii5000c0ffvako05uti' } });
  assert.equal(pdf.requestId, f.requestId); assert.equal(pdf.mimeType, 'application/pdf'); assert.ok(pdf.fileName.startsWith('T24_ACCEPTANCE_')); assert.equal(Buffer.from(pdf.data).subarray(0, 4).toString(), '%PDF');
  const vehicle = await db.service.findUniqueOrThrow({ where: { key: 'VEHICLE_TRANSPORT' } });
  const result = await db.$transaction(async tx => {
    const request = await tx.transportRequest.create({ data: { customerId: customer.id, serviceId: vehicle.id, itemType: 'VEHICLE', status: 'DRAFT', itemTitle: 'SYNTHETIC private-file session race only', isImmediate: true, currency: 'CHF' } });
    const file = await tx.requestFile.create({ data: { requestId: request.id, uploadedById: customer.id, category: 'OFFICIAL', documentType: 'OTHER', fileName: 'T24_ACCEPTANCE_CUSTOMER_SESSION_20261106.pdf', mimeType: pdf.mimeType, size: pdf.size, data: pdf.data } });
    return { customerId: customer.id, requestId: request.id, fileId: file.id, fileName: file.fileName, fileSha256: crypto.createHash('sha256').update(pdf.data).digest('hex'), fileBytes: pdf.size };
  });
  const evidence = { ...result, createdAt: new Date().toISOString(), scope: 'Seeded synthetic DRAFT plus task-owned PDF bytes for native read/account race only. No upload, funded booking, transport or provider acceptance.' };
  fs.writeFileSync(record, JSON.stringify(evidence, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(root, 'docs/release-2026-11-05/evidence/nov06-customer-private-file-fixture.json'), JSON.stringify(evidence, null, 2)+'\n');
  console.log(JSON.stringify(evidence));
})().catch(() => { console.error('Synthetic private-file fixture failed; retain existing database and inspect privately.'); process.exitCode = 1; }).finally(() => db.$disconnect());
