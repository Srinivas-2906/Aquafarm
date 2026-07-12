import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding AquaLedger demo data...');

  const org = await prisma.organization.upsert({
    where: { id: 'demo-org-001' },
    update: {},
    create: {
      id: 'demo-org-001',
      name: 'Sandhya Demo Operations',
      timezone: 'Asia/Kolkata',
      pondTerm: 'Tank',
      status: 'ACTIVE',
    },
  });

  const demoPin = await bcrypt.hash('123456', 12);

  const demoUsers = [
    {
      phoneNumber: '9985533376',
      legacyPhoneNumber: '9876543210',
      displayName: 'Demo Owner',
      role: 'OWNER' as const,
    },
    {
      phoneNumber: '9008747926',
      legacyPhoneNumber: '9876543211',
      displayName: 'Demo Supervisor',
      role: 'SUPERVISOR' as const,
    },
  ];

  const ensuredUsers = [];
  for (const demoUser of demoUsers) {
    const legacy = await prisma.user.findUnique({
      where: {
        organizationId_phoneNumber: {
          organizationId: org.id,
          phoneNumber: demoUser.legacyPhoneNumber,
        },
      },
    });

    if (legacy) {
      ensuredUsers.push(
        await prisma.user.update({
          where: { id: legacy.id },
          data: {
            phoneNumber: demoUser.phoneNumber,
            displayName: demoUser.displayName,
            role: demoUser.role,
            pinHash: demoPin,
            preferredLanguage: 'en',
            status: 'ACTIVE',
          },
        }),
      );
      continue;
    }

    ensuredUsers.push(
      await prisma.user.upsert({
        where: {
          organizationId_phoneNumber: {
            organizationId: org.id,
            phoneNumber: demoUser.phoneNumber,
          },
        },
        update: {
          displayName: demoUser.displayName,
          role: demoUser.role,
          pinHash: demoPin,
          preferredLanguage: 'en',
          status: 'ACTIVE',
        },
        create: {
          organizationId: org.id,
          phoneNumber: demoUser.phoneNumber,
          displayName: demoUser.displayName,
          role: demoUser.role,
          pinHash: demoPin,
          preferredLanguage: 'en',
          status: 'ACTIVE',
        },
      }),
    );
  }

  const owner = ensuredUsers.find((user) => user.role === 'OWNER');
  const supervisor = ensuredUsers.find((user) => user.role === 'SUPERVISOR');
  if (!owner || !supervisor) {
    throw new Error('Failed to seed demo owner and supervisor users');
  }

  const farm = await prisma.farm.upsert({
    where: { id: 'demo-farm-001' },
    update: {},
    create: {
      id: 'demo-farm-001',
      organizationId: org.id,
      name: 'Village Shrimp Farm',
      location: 'Andhra Pradesh, India',
      timezone: 'Asia/Kolkata',
      status: 'ACTIVE',
    },
  });

  await prisma.farmUser.upsert({
    where: { farmId_userId: { farmId: farm.id, userId: owner.id } },
    update: {},
    create: { farmId: farm.id, userId: owner.id, role: 'OWNER' },
  });

  await prisma.farmUser.upsert({
    where: { farmId_userId: { farmId: farm.id, userId: supervisor.id } },
    update: {},
    create: { farmId: farm.id, userId: supervisor.id, role: 'SUPERVISOR' },
  });

  const tankNames = ['Tank 1', 'Tank 2', 'Tank 3', 'Tank 4', 'Tank 5', 'Tank 6'];
  const ponds = [];
  for (let i = 0; i < tankNames.length; i++) {
    const code = String(i + 1);
    const pond = await prisma.pond.upsert({
      where: { farmId_code: { farmId: farm.id, code } },
      update: {},
      create: {
        organizationId: org.id,
        farmId: farm.id,
        name: tankNames[i],
        code,
        type: 'TANK',
        area: 0.5 + i * 0.1,
        areaUnit: 'hectare',
        status: 'ACTIVE',
      },
    });
    ponds.push(pond);
  }

  const stockingDate = new Date();
  stockingDate.setDate(stockingDate.getDate() - 24);

  const cycles = [];
  for (const pond of ponds) {
    const cycle = await prisma.cultureCycle.upsert({
      where: { id: `cycle-${pond.code}` },
      update: {},
      create: {
        id: `cycle-${pond.code}`,
        organizationId: org.id,
        farmId: farm.id,
        pondId: pond.id,
        cycleName: `Cycle ${pond.code} - Vannamei`,
        stockingDate,
        species: 'Vannamei',
        seedCount: 500000,
        usualMealsPerDay: 4,
        status: 'ACTIVE',
      },
    });
    cycles.push(cycle);
  }

  const feedProducts = [];
  for (const code of ['1C', '2C', '3C']) {
    const fp = await prisma.feedProduct.upsert({
      where: { farmId_feedCode: { farmId: farm.id, feedCode: code } },
      update: {},
      create: {
        organizationId: org.id,
        farmId: farm.id,
        brandName: `Demo Feed ${code}`,
        feedCode: code,
        pelletSize: code === '1C' ? '1.2mm' : code === '2C' ? '1.5mm' : '2.0mm',
        bagWeightKg: 25,
        supplierName: 'Demo Supplier',
        lowStockThresholdKg: code === '3C' ? 200 : 100,
        status: 'ACTIVE',
      },
    });
    feedProducts.push(fp);
  }

  for (const fp of feedProducts) {
    await prisma.inventoryTransaction.upsert({
      where: { clientTransactionId: `opening-${fp.feedCode}` },
      update: {},
      create: {
        clientTransactionId: `opening-${fp.feedCode}`,
        organizationId: org.id,
        farmId: farm.id,
        feedProductId: fp.id,
        type: 'OPENING_BALANCE',
        direction: 'IN',
        quantityKg: fp.feedCode === '3C' ? 150 : 500,
        transactionDate: new Date(stockingDate),
        remarks: 'Opening balance',
        createdByUserId: owner.id,
        status: 'CONFIRMED',
      },
    });

    await prisma.inventoryTransaction.upsert({
      where: { clientTransactionId: `received-${fp.feedCode}` },
      update: {},
      create: {
        clientTransactionId: `received-${fp.feedCode}`,
        organizationId: org.id,
        farmId: farm.id,
        feedProductId: fp.id,
        type: 'FEED_RECEIVED',
        direction: 'IN',
        quantityKg: 250,
        transactionDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        remarks: 'Feed delivery',
        supplierName: 'Demo Supplier',
        numberOfBags: 10,
        createdByUserId: supervisor.id,
        status: 'CONFIRMED',
      },
    });
  }

  await prisma.inventoryTransaction.upsert({
    where: { clientTransactionId: 'wastage-1c' },
    update: {},
    create: {
      clientTransactionId: 'wastage-1c',
      organizationId: org.id,
      farmId: farm.id,
      feedProductId: feedProducts[0].id,
      type: 'WASTAGE',
      direction: 'OUT',
      quantityKg: 2.5,
      transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      remarks: 'Bag torn during transport',
      createdByUserId: supervisor.id,
      status: 'CONFIRMED',
    },
  });

  const feedProduct = feedProducts[0];
  for (let dayOffset = 14; dayOffset >= 1; dayOffset--) {
    const feedingDate = new Date();
    feedingDate.setDate(feedingDate.getDate() - dayOffset);
    const dateStr = feedingDate.toISOString().split('T')[0];
    const doc = 24 - dayOffset + 1;
    const baseQty = 4 + Math.floor((14 - dayOffset) * 0.3);

    for (let p = 0; p < ponds.length; p++) {
      const pond = ponds[p];
      const cycle = cycles[p];
      const clientEntryId = `seed-entry-${pond.code}-${dateStr}`;

      const existing = await prisma.feedingEntry.findUnique({
        where: { clientEntryId },
      });
      if (existing) continue;

      const qty1 = baseQty + p * 0.2;
      const qty2 = baseQty + p * 0.2;
      const qty3 = baseQty + 1 + p * 0.3;
      const qty4 = baseQty + p * 0.2;
      const tdf = qty1 + qty2 + qty3 + qty4;

      const entry = await prisma.feedingEntry.create({
        data: {
          clientEntryId,
          organizationId: org.id,
          farmId: farm.id,
          pondId: pond.id,
          cultureCycleId: cycle.id,
          feedingDate,
          doc,
          feedProductId: feedProduct.id,
          status: 'CONFIRMED',
          submissionType: 'NORMAL',
          syncStatus: 'SYNCED',
          enteredByUserId: supervisor.id,
          meals: {
            create: [
              { mealNumber: 1, feedQuantityKg: qty1, actualTime: '07:00', appetiteStatus: 'NORMAL' },
              { mealNumber: 2, feedQuantityKg: qty2, actualTime: '12:00', appetiteStatus: 'NORMAL' },
              { mealNumber: 3, feedQuantityKg: qty3, actualTime: '17:00', appetiteStatus: 'NORMAL', checkTrayRemainingPercentage: 'BETWEEN_5_10' },
              { mealNumber: 4, feedQuantityKg: qty4, actualTime: '20:00', appetiteStatus: 'NORMAL' },
            ],
          },
        },
      });

      await prisma.inventoryTransaction.create({
        data: {
          clientTransactionId: `consumed-${pond.code}-${dateStr}`,
          organizationId: org.id,
          farmId: farm.id,
          feedProductId: feedProduct.id,
          pondId: pond.id,
          feedingEntryId: entry.id,
          type: 'FEED_CONSUMED',
          direction: 'OUT',
          quantityKg: tdf,
          transactionDate: feedingDate,
          createdByUserId: supervisor.id,
          status: 'CONFIRMED',
        },
      });
    }
  }

  const lateDate = new Date();
  lateDate.setDate(lateDate.getDate() - 5);
  const latePond = ponds[ponds.length - 1];
  const lateConflict = await prisma.feedingEntry.findUnique({
    where: { pondId_feedingDate: { pondId: latePond.id, feedingDate: lateDate } },
  });
  if (!lateConflict) {
    await prisma.feedingEntry.upsert({
      where: { clientEntryId: 'late-offline-submission' },
      update: {},
      create: {
        clientEntryId: 'late-offline-submission',
        organizationId: org.id,
        farmId: farm.id,
        pondId: latePond.id,
        cultureCycleId: cycles[cycles.length - 1].id,
        feedingDate: lateDate,
        doc: 19,
        feedProductId: feedProduct.id,
        status: 'PENDING_OWNER_APPROVAL',
        submissionType: 'LATE_OFFLINE_SUBMISSION',
        syncStatus: 'SYNCED',
        remarks: 'Entered offline on weak signal day',
        enteredByUserId: supervisor.id,
        deviceCreatedAt: lateDate,
        meals: {
          create: [
            { mealNumber: 1, feedQuantityKg: 5.0, actualTime: '07:00' },
            { mealNumber: 2, feedQuantityKg: 5.0, actualTime: '12:00' },
            { mealNumber: 3, feedQuantityKg: 6.0, actualTime: '17:00' },
            { mealNumber: 4, feedQuantityKg: 5.0, actualTime: '20:00' },
          ],
        },
      },
    });
  }

  console.log('Seed complete!');
  console.log('');
  console.log('=== DEVELOPMENT CREDENTIALS (DO NOT USE IN PRODUCTION) ===');
  console.log('Owner:      Phone 9985533376  PIN 123456');
  console.log('Supervisor: Phone 9008747926  PIN 123456');
  console.log('OTP Mock:   123456');
  console.log('Farm ID:    demo-farm-001');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
