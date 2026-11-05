require('./environment.cjs').assertRuntime();
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const prisma = new PrismaService();
(async()=>{
  await prisma.$connect();
  for(const [index,[key,name,arabic,icon]] of [
    ['VEHICLE_TRANSPORT','Vehicle Transport','نقل السيارات','car'],
    ['MOTORCYCLE_TRANSPORT','Motorcycle & Bicycle','نقل الدراجات النارية والهوائية','motorcycle'],
    ['GOODS_TRANSPORT','Goods Transport','نقل البضائع','box'],
    ['FURNITURE_TRANSPORT','House Moving','نقل المنازل','sofa'],
  ].entries()) {
    await prisma.service.upsert({where:{key},update:{},create:{key,nameEn:name,nameAr:arabic,descriptionEn:'Isolated synthetic acceptance catalog',descriptionAr:'كتالوج اختبار معزول',icon,sortOrder:index+1}});
  }
  const brand=await prisma.vehicleBrand.upsert({where:{slug:'synthetic-staging-brand'},update:{},create:{name:'Synthetic staging brand',slug:'synthetic-staging-brand'}});
  await prisma.vehicleModel.upsert({where:{brandId_slug:{brandId:brand.id,slug:'synthetic-model'}},update:{},create:{brandId:brand.id,name:'Synthetic model',slug:'synthetic-model',bodyType:'Sedan'}});
  console.log('Prepared all four real service categories and a synthetic catalog brand/model. No existing app data or provider was accessed.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
