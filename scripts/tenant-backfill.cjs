// Reviewed input only: never derive ownership from phone, GPS or profile country.
const { readFileSync } = require('node:fs');
const { isISO31661Alpha2, isISO4217CurrencyCode } = require('class-validator');

function validatePlan(input) {
  if (
    !input ||
    !Array.isArray(input.tenants) ||
    !Array.isArray(input.assignments)
  ) {
    throw new Error('Plan must contain tenants and assignments arrays.');
  }
  const codes = new Set();
  const countries = new Set();
  const tenants = input.tenants.map((value) => {
    const {
      code,
      countryCode,
      name,
      defaultCurrency,
      timezone,
      defaultLocale = null,
      isActive = true,
    } = value;
    if (
      typeof code !== 'string' ||
      !/^[A-Z][A-Z0-9_-]{1,31}$/.test(code) ||
      codes.has(code)
    )
      throw new Error('Invalid or duplicate tenant code.');
    if (
      typeof countryCode !== 'string' ||
      countryCode !== countryCode.toUpperCase() ||
      !isISO31661Alpha2(countryCode) ||
      countries.has(countryCode)
    )
      throw new Error('Invalid or duplicate tenant country.');
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof timezone !== 'string' ||
      !timezone.trim()
    )
      throw new Error('Tenant name and timezone are required.');
    if (
      typeof defaultCurrency !== 'string' ||
      !isISO4217CurrencyCode(defaultCurrency)
    )
      throw new Error('Invalid tenant currency.');
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    if (defaultLocale !== null) new Intl.Locale(defaultLocale);
    if (typeof isActive !== 'boolean')
      throw new Error('isActive must be boolean.');
    codes.add(code);
    countries.add(countryCode);
    return {
      code,
      countryCode,
      name: name.trim(),
      defaultCurrency,
      timezone,
      defaultLocale,
      isActive,
    };
  });
  const users = new Set();
  const assignments = input.assignments.map(({ userId, marketCode }) => {
    if (
      typeof userId !== 'string' ||
      !userId.trim() ||
      users.has(userId) ||
      typeof marketCode !== 'string' ||
      !/^[A-Z][A-Z0-9_-]{1,31}$/.test(marketCode)
    )
      throw new Error('Invalid or duplicate user assignment.');
    users.add(userId);
    return { userId, marketCode };
  });
  return { tenants, assignments };
}

async function applyPlan(prisma, rawPlan, apply = false) {
  const plan = validatePlan(rawPlan);
  return prisma.$transaction(
    async (tx) => {
      const markets = new Map();
      for (const tenant of plan.tenants) {
        const existing = await tx.tenant.findUnique({
          where: { code: tenant.code },
        });
        if (
          existing &&
          Object.keys(tenant).some((key) => existing[key] !== tenant[key])
        ) {
          throw new Error(
            `Tenant ${tenant.code} differs from the plan; backfill never changes existing tenant configuration.`,
          );
        }
        const byCountry = await tx.tenant.findUnique({
          where: { countryCode: tenant.countryCode },
        });
        if (byCountry && byCountry.code !== tenant.code)
          throw new Error(
            `Country ${tenant.countryCode} already belongs to another tenant.`,
          );
        const record =
          existing ||
          (apply
            ? await tx.tenant.create({ data: tenant })
            : { ...tenant, id: null });
        markets.set(tenant.code, record);
      }
      let assigned = 0;
      for (const entry of plan.assignments) {
        const tenant =
          markets.get(entry.marketCode) ||
          (await tx.tenant.findUnique({ where: { code: entry.marketCode } }));
        if (!tenant || !tenant.isActive)
          throw new Error(
            `Assignment uses an unknown or inactive market: ${entry.marketCode}.`,
          );
        const user = await tx.user.findUnique({
          where: { id: entry.userId },
          select: { id: true, tenantId: true },
        });
        if (!user) throw new Error('Assignment references an unknown user.');
        if (user.tenantId && user.tenantId !== tenant.id)
          throw new Error('Account tenant transfer is not supported.');
        if (!user.tenantId) {
          if (apply) {
            const updated = await tx.user.updateMany({
              where: { id: user.id, tenantId: null },
              data: { tenantId: tenant.id },
            });
            if (updated.count !== 1)
              throw new Error(
                'Concurrent ownership change; retry after reviewing the mapping.',
              );
          }
          assigned++;
        }
      }
      const remainingUnassigned = await tx.user.count({
        where: {
          tenantId: null,
          role: { in: ['CUSTOMER', 'DRIVER'] },
          deletedAt: null,
        },
      });
      return {
        mode: apply ? 'applied' : 'dry-run',
        tenants: plan.tenants.length,
        assignments: assigned,
        remainingUnassigned,
      };
    },
    { isolationLevel: 'Serializable', timeout: 60_000 },
  );
}

module.exports = { validatePlan, applyPlan };

if (require.main === module) {
  require('dotenv/config');
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const args = process.argv.slice(2);
  const path = args.find((arg) => !arg.startsWith('--'));
  if (!path || args.some((arg) => arg.startsWith('--') && arg !== '--apply'))
    throw new Error(
      'Usage: node scripts/tenant-backfill.cjs plan.json [--apply]',
    );
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  applyPlan(
    prisma,
    JSON.parse(readFileSync(path, 'utf8')),
    args.includes('--apply'),
  )
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
