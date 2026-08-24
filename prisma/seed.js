require('dotenv/config');
const { randomBytes, scryptSync } = require('crypto');

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, DriverStatus, ServiceKey, UserRole } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

const services = [
  { key: ServiceKey.VEHICLE_TRANSPORT, nameEn: 'Vehicle Transport', nameAr: 'نقل السيارات', descriptionEn: 'Transport vehicles safely and efficiently.', descriptionAr: 'نقل المركبات بأمان وكفاءة.', icon: 'car', isActive: true, sortOrder: 1 },
  { key: ServiceKey.MOTORCYCLE_TRANSPORT, nameEn: 'Motorcycle & Bicycle', nameAr: 'نقل الدراجات النارية والهوائية', descriptionEn: 'Specialized transport for motorcycles and bicycles.', descriptionAr: 'خدمة نقل مخصصة للدراجات النارية والهوائية.', icon: 'motorcycle', isActive: true, sortOrder: 2 },
  { key: ServiceKey.GOODS_TRANSPORT, nameEn: 'Goods Transport', nameAr: 'نقل البضائع', descriptionEn: 'Reliable delivery for goods and packages.', descriptionAr: 'توصيل موثوق للبضائع والطرود.', icon: 'box', isActive: true, sortOrder: 3 },
  { key: ServiceKey.FURNITURE_TRANSPORT, nameEn: 'House Moving', nameAr: 'نقل المنازل', descriptionEn: 'Professional house-moving service.', descriptionAr: 'خدمة نقل منازل احترافية.', icon: 'sofa', isActive: true, sortOrder: 4 },
];

const vehicleCatalog = [
  { name: 'Mercedes-Benz', slug: 'mercedes-benz', models: [
    { name: 'C-Class', slug: 'c-class', bodyType: 'Sedan', series: ['C180','C200','C220','C230','C240','C250','C280','C300','C320','C350'] },
    { name: 'E-Class', slug: 'e-class', bodyType: 'Sedan', series: ['E200','E220','E230','E240','E250','E280','E300','E320','E350','E400'] },
    { name: 'S-Class', slug: 's-class', bodyType: 'Sedan', series: ['S320','S350','S400','S450','S500','S550'] },
    { name: 'GLC', slug: 'glc', bodyType: 'SUV', series: ['GLC200','GLC250','GLC300'] },
    { name: 'GLE', slug: 'gle', bodyType: 'SUV', series: ['GLE300','GLE350','GLE400','GLE450'] },
    { name: 'G-Class', slug: 'g-class', bodyType: 'SUV', series: ['G320','G350','G500','G550','G63 AMG'] },
  ]},
  { name: 'BMW', slug: 'bmw', models: [
    { name: '3 Series', slug: '3-series', bodyType: 'Sedan', series: ['316i','318i','320i','325i','328i','330i','335i','340i'] },
    { name: '5 Series', slug: '5-series', bodyType: 'Sedan', series: ['520i','523i','525i','528i','530i','535i','540i','550i'] },
    { name: '7 Series', slug: '7-series', bodyType: 'Sedan', series: ['730i','735i','740i','745i','750i','760i'] },
    { name: 'X3', slug: 'x3', bodyType: 'SUV', series: ['X3 20i','X3 25i','X3 30i','X3 35i'] },
    { name: 'X5', slug: 'x5', bodyType: 'SUV', series: ['X5 30i','X5 35i','X5 40i','X5 50i'] },
    { name: 'X6', slug: 'x6', bodyType: 'SUV', series: ['X6 35i','X6 40i','X6 50i'] },
    { name: 'X7', slug: 'x7', bodyType: 'SUV', series: ['X7 40i','X7 50i'] },
  ]},
  { name: 'Audi', slug: 'audi', models: [{ name: 'A4', slug: 'a4', bodyType: 'Sedan', series: ['A4 35','A4 40'] }] },
  { name: 'Volkswagen', slug: 'volkswagen', models: [{ name: 'Passat', slug: 'passat', bodyType: 'Sedan', series: ['Passat 1.4','Passat 2.0'] }] },
  { name: 'Toyota', slug: 'toyota', models: [{ name: 'Camry', slug: 'camry', bodyType: 'Sedan', series: ['Camry LE','Camry SE'] }] },
  { name: 'Nissan', slug: 'nissan', models: [{ name: 'Altima', slug: 'altima', bodyType: 'Sedan', series: ['Altima S','Altima SV'] }] },
  { name: 'Hyundai', slug: 'hyundai', models: [{ name: 'Sonata', slug: 'sonata', bodyType: 'Sedan', series: ['Sonata Smart','Sonata Premium'] }] },
  { name: 'Kia', slug: 'kia', models: [{ name: 'K5', slug: 'k5', bodyType: 'Sedan', series: ['K5 LX','K5 EX'] }] },
  { name: 'Ford', slug: 'ford', models: [{ name: 'Explorer', slug: 'explorer', bodyType: 'SUV', series: ['Explorer XLT','Explorer Limited'] }] },
  { name: 'Chevrolet', slug: 'chevrolet', models: [{ name: 'Tahoe', slug: 'tahoe', bodyType: 'SUV', series: ['Tahoe LS','Tahoe LT'] }] },
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function estimateWeight(bodyType, seriesName, index) {
  const name = seriesName.toLowerCase();
  if (name.includes('g63') || name.includes('g550')) return 2550;
  if (name.includes('g500')) return 2480;
  if (bodyType === 'SUV') return 1950 + index * 20;
  return 1450 + index * 12;
}

async function seedVehicleCatalog() {
  for (const brand of vehicleCatalog) {
    const dbBrand = await prisma.vehicleBrand.upsert({ where: { slug: brand.slug }, update: { name: brand.name, isActive: true }, create: { name: brand.name, slug: brand.slug, isActive: true } });
    for (const model of brand.models) {
      const dbModel = await prisma.vehicleModel.upsert({ where: { brandId_slug: { brandId: dbBrand.id, slug: model.slug } }, update: { name: model.name, bodyType: model.bodyType, isActive: true }, create: { brandId: dbBrand.id, name: model.name, slug: model.slug, bodyType: model.bodyType, isActive: true } });
      for (const [index, variant] of model.series.entries()) {
        const variantSlug = slugify(variant);
        const yearFrom = 2000 + (index % 8);
        const yearTo = 2026;
        const estimatedWeightKg = estimateWeight(model.bodyType, variant, index);
        await prisma.vehicleSeries.upsert({
          where: { modelId_slug: { modelId: dbModel.id, slug: variantSlug } },
          update: { name: variant, variantName: variant, yearFrom, yearTo, estimatedWeightKg, bodyType: model.bodyType, isActive: true },
          create: { modelId: dbModel.id, name: variant, slug: variantSlug, variantName: variant, yearFrom, yearTo, estimatedWeightKg, bodyType: model.bodyType, isActive: true },
        });
      }
    }
  }
}

async function main() {
  for (const service of services) {
    await prisma.service.upsert({
      where: { key: service.key },
      update: {
        nameEn: service.nameEn,
        nameAr: service.nameAr,
        descriptionEn: service.descriptionEn,
        descriptionAr: service.descriptionAr,
        icon: service.icon,
        isActive: service.isActive,
        sortOrder: service.sortOrder,
      },
      create: service,
    });
  }

  await seedVehicleCatalog();

  const customerEmail = 'raed.ghanim.2014@gmail.com';
  const customerPassword = 'Voltermot1';
  const customerPasswordHash = hashPassword(customerPassword);

  await prisma.user.upsert({
    where: { email: customerEmail },
    update: {
      name: 'Raed Ghanim',
      role: UserRole.CUSTOMER,
      passwordHash: customerPasswordHash,
    },
    create: {
      name: 'Raed Ghanim',
      email: customerEmail,
      role: UserRole.CUSTOMER,
      passwordHash: customerPasswordHash,
    },
  });

  const driverEmail = 'driver@test.com';
  const driverPassword = driverEmail;
  const passwordHash = hashPassword(driverPassword);

  await prisma.user.upsert({
    where: { email: driverEmail },
    update: {
      name: 'Driver Test',
      role: UserRole.DRIVER,
      passwordHash,
      driverProfile: {
        upsert: {
          update: {
            firstName: 'Driver',
            lastName: 'Test',
            phone: '+96170000000',
            status: DriverStatus.PENDING_PROFILE,
            isProfileCompleted: false,
          },
          create: {
            firstName: 'Driver',
            lastName: 'Test',
            phone: '+96170000000',
            status: DriverStatus.PENDING_PROFILE,
            isProfileCompleted: false,
          },
        },
      },
    },
    create: {
      name: 'Driver Test',
      email: driverEmail,
      role: UserRole.DRIVER,
      passwordHash,
      driverProfile: {
        create: {
          firstName: 'Driver',
          lastName: 'Test',
          phone: '+96170000000',
          status: DriverStatus.PENDING_PROFILE,
          isProfileCompleted: false,
        },
      },
    },
  });

  const adminEmail = 'admin@transpo24.com';
  const adminPassword = 'admin12345';
  const adminPasswordHash = hashPassword(adminPassword);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: 'Admin User',
      role: UserRole.ADMIN,
      passwordHash: adminPasswordHash,
    },
    create: {
      name: 'Admin User',
      email: adminEmail,
      role: UserRole.ADMIN,
      passwordHash: adminPasswordHash,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
