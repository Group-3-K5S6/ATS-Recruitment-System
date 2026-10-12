/**
 * ATS Sprint 1-2: safe SQLite upgrade rehearsal.
 * Copies be/prisma/ats.db to ats-sprint12-test.db, upgrades ONLY the COPY,
 * and checks row counts, schema columns and SQLite integrity.
 * Never connects to the original file with a writable Prisma client.
 * Requirements: run from be/; place this file inside be/scripts/;
 *               stop the backend first; Prisma Client already generated.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const projectBe = path.resolve(__dirname, '..');
const prismaDir = path.join(projectBe, 'prisma');
const original = path.join(prismaDir, 'ats.db');
const test = path.join(prismaDir, 'ats-sprint12-test.db');
const requiredTables = ['User', 'Role', 'Department', 'JobTitle', 'Requisition', 'CompanyProfile'];

const additions = {
  Requisition: [
    ['jobTitleId', 'TEXT REFERENCES "JobTitle"("id") ON DELETE RESTRICT ON UPDATE CASCADE'],
    ['reason', 'TEXT'],
    ['proposedSalaryMin', 'REAL'],
    ['proposedSalaryMax', 'REAL'],
    ['targetDate', 'DATETIME'],
    ['description', 'TEXT'],
    ['requirements', 'TEXT'],
    ['salaryExplanation', 'TEXT'],
  ],
  CompanyProfile: [
    ['logoData', 'TEXT'],
    ['bannerData', 'TEXT'],
  ],
};
const categoryCols = ['id', 'category', 'name', 'position', 'createdAt', 'updatedAt'];

async function run() {
  if (!fs.existsSync(original)) throw Error('Khong thay DB goc be/prisma/ats.db. Khong lam gi.');
  if (fs.existsSync(test)) throw Error('DB thu nghiem da ton tai: prisma/ats-sprint12-test.db. Khong ghi de.');
  if (fs.existsSync(original + '-wal') || fs.existsSync(original + '-shm')) {
    throw Error('Co tep SQLite -wal/-shm: dung Backend va dam bao da checkpoint truoc khi sao chep. Khong sao chep luc DB dang ghi.');
  }

  fs.copyFileSync(original, test, fs.constants.COPYFILE_EXCL);
  console.log('DA TAO BAN SAO: prisma/ats-sprint12-test.db');
  const prisma = new PrismaClient({
    datasources: { db: { url: 'file:./ats-sprint12-test.db' } },
    log: ['error'],
  });

  const columns = async (client, table) => {
    const rows = await client.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
    return new Set(rows.map(r => r.name));
  };
  const integrity = async () => {
    const rows = await prisma.$queryRawUnsafe('PRAGMA integrity_check');
    return rows.every(r => Object.values(r).includes('ok'));
  };
  const fkCheck = async () => await prisma.$queryRawUnsafe('PRAGMA foreign_key_check');
  const counts = async () => {
    const result = {};
    for (const table of requiredTables) {
      const value = await prisma.$queryRawUnsafe(`SELECT count(*) AS n FROM "${table}"`);
      result[table] = String(value[0].n); // Prisma returns bigint for SQLite COUNT(*)
    }
    return result;
  };

  try {
    for (const table of requiredTables) {
      const found = await prisma.$queryRawUnsafe('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', 'table', table);
      if (found.length !== 1) throw Error('Thieu bang nen tang ' + table + '; dung de tranh thay doi khong an toan.');
    }
    if (!(await integrity())) throw Error('Ban sao DB khong qua PRAGMA integrity_check; dung lai.');
    const before = await counts();
    const fkBefore = (await fkCheck()).length;

    await prisma.$transaction(async tx => {
      for (const [table, fields] of Object.entries(additions)) {
        const existing = await columns(tx, table);
        for (const [column, declaration] of fields) {
          if (!existing.has(column)) {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${declaration}`);
            console.log('THEM COT: ' + table + '.' + column);
          }
        }
      }
      const categoryTable = await tx.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name='RecruitmentCategory'");
      if (categoryTable.length === 0) {
        await tx.$executeRawUnsafe(`CREATE TABLE "RecruitmentCategory" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "category" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "position" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('TAO BANG: RecruitmentCategory');
      }
      const categoryExisting = await columns(tx, 'RecruitmentCategory');
      const categoryMissing = categoryCols.filter(c => !categoryExisting.has(c));
      if (categoryMissing.length) throw Error('RecruitmentCategory co cau truc bat thuong: ' + categoryMissing.join(', '));
      await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "RecruitmentCategory_category_name_key" ON "RecruitmentCategory"("category", "name")');
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "RecruitmentCategory_category_position_idx" ON "RecruitmentCategory"("category", "position")');
    }, { timeout: 20000 });

    for (const [table, fields] of Object.entries(additions)) {
      const actual = await columns(prisma, table);
      const missing = fields.filter(([name]) => !actual.has(name));
      if (missing.length) throw Error('Sau nang cap van thieu: ' + table + '.' + missing.map(x => x[0]).join(', '));
    }
    const after = await counts();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('SO BAN GHI THAY DOI! Bao lai truoc khi lam tiep.');
    if (!(await integrity())) throw Error('PRAGMA integrity_check sau nang cap KHONG DAT');
    const fkAfter = (await fkCheck()).length;
    if (fkAfter > fkBefore) throw Error('So loi khoa ngoai tang tu ' + fkBefore + ' len ' + fkAfter);

    console.log('\nKET QUA THU NGHIEM: DAT');
    console.log('So ban ghi cac bang cu khong doi: ' + JSON.stringify(after));
    console.log('PRAGMA integrity_check: ok; loi khoa ngoai: ' + fkBefore + ' -> ' + fkAfter);
    console.log('CHI DA SUA prisma/ats-sprint12-test.db; KHONG SUA prisma/ats.db');
    console.log('Luu y: chua doi chieu tat ca index/foreign key voi Prisma Schema; chua nang cap DB that.');
  } finally {
    await prisma.$disconnect();
  }
}
run().catch(err => { console.error('KHONG HOAN TAT: ' + err.message); process.exitCode = 1; });
