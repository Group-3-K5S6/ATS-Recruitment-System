/* READ-ONLY. Prints SQLite schema discrepancies; never edits database. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const tables = {
  Requisition: ['jobTitleId', 'reason', 'proposedSalaryMin', 'proposedSalaryMax', 'targetDate', 'requirements', 'salaryExplanation'],
  CompanyProfile: ['companyName', 'isPublished', 'logoData', 'bannerData'],
  RecruitmentCategory: ['id', 'category', 'name', 'position'],
  User: ['avatarImage', 'avatarThumbnail', 'tokenVersion'],
};
(async () => {
  let missing = 0;
  for (const [table, columns] of Object.entries(tables)) {
    const escapedTable = table.replace(/"/g, '""');
    const actual = await prisma.$queryRawUnsafe(`PRAGMA table_info("${escapedTable}")`);
    const names = new Set(actual.map(row => row.name));
    const absent = columns.filter(column => !names.has(column));
    if (absent.length) {
      missing += absent.length;
      process.stdout.write(`${table}: THIEU ${absent.join(', ')}\n`);
    } else {
      process.stdout.write(`${table}: DU CAC COT CAN KIEM TRA\n`);
    }
  }
  process.stdout.write(`Tong so cot thieu: ${missing}. KHONG CO DU LIEU NAO BI THAY DOI.\n`);
})().catch(e => { console.error('Khong kiem tra duoc:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
