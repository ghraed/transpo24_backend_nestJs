require('dotenv').config({path: require('node:path').join(__dirname, '../.env'), quiet:true});
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { NotificationsService } = require('../dist/src/notifications/notifications.service');
(async () => {
  if (process.env.PUSH_ENVIRONMENT !== 'DEVELOPMENT') throw new Error('This preview is only available in the development push environment.');
  const prisma = new PrismaService();
  try {
    const device = await prisma.pushToken.findUnique({where:{id:process.argv[2]}});
    if (!device || device.applicationId !== 'com.transpo24.app.dev' || device.environment !== 'DEVELOPMENT' || !device.isActive) throw new Error('A registered development customer device is required.');
    // Keep this test scoped to the one connected device, even if the customer owns others.
    const findMany = prisma.pushToken.findMany.bind(prisma.pushToken);
    const scoped = { customerNotification: prisma.customerNotification, pushToken: {
      findMany: args => findMany({...args,where:{...args.where,id:device.id}}),
      update: prisma.pushToken.update.bind(prisma.pushToken),
      updateMany: prisma.pushToken.updateMany.bind(prisma.pushToken),
    }};
    const notifications = new NotificationsService(scoped, {sendToUser: async () => undefined});
    await prisma.customerNotification.updateMany({where:{userId:device.userId,type:'TEST_NOTIFICATION',data:{path:['reminderPreview'],equals:true},readAt:null},data:{readAt:new Date()}});
    const now = Date.now();
    await notifications.sendToUsers({userIds:[device.userId], app:'CUSTOMER',
      type:'TEST_NOTIFICATION', title:'Pickup reminder · Transpo24 Dev',
      body:'Your furniture pickup reminder is ready. Open Transpo24 Dev to preview confirmation and payment.',
      data:{reminderPreview:true, pickupAt:new Date(now+47*3600000).toISOString(), deadlineAt:new Date(now+23*3600000).toISOString(), price:120,currency:'CHF',pickupAddress:'Demo pickup',dropoffAddress:'Demo delivery'},
      retryPersistedEvent:true});
    console.log('Reminder preview saved and push dispatch completed for the connected development device.');
  } finally { await prisma.$disconnect(); }
})().catch(e=>{console.error(e.message);process.exitCode=1});
