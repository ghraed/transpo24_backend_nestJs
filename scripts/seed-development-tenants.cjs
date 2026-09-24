require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { applyPlan } = require('./tenant-backfill.cjs');

if (!['development', 'test'].includes(process.env.NODE_ENV)) {
  throw new Error(
    'Development tenants can only be seeded with NODE_ENV=development or test.',
  );
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
applyPlan(prisma, require('../prisma/fixtures/tenants.development.json'), true)
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
