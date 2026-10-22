/**
 * ATS Sprint 1-2: additive-only SQLite migration.
 * Usage (in be/):
 *   node .\scripts\ATS-Sprint12-nang-cap-an-toan.cjs --check
 *   node .\scripts\ATS-Sprint12-nang-cap-an-toan.cjs --apply "C:\\...\\ATS-DB-Backup-...\\ats.db"
 * Requires Backend and Prisma Studio STOPPED. No automatic data reset.
 * This script intentionally preserves the legacy JobCompetencyFramework table.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const backend = path.resolve(__dirname, '..');
const database = path.join(backend, 'prisma', 'ats.db');
const schema = path.join(backend, 'prisma', 'schema.prisma');
const mode = process.argv[2];
const backupArg = process.argv[3];
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
const categoryFields = ['id', 'category', 'name', 'position', 'createdAt', 'updatedAt'];
const requiredTables = ['User', 'Role', 'JobTitle', 'Requisition', 'CompanyProfile'];

function die(message) { throw new Error(message); }
function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function ensureEnvironment() {
  if (process.cwd().toLowerCase() !== backend.toLowerCase()) die('Hay chay lenh tu thu muc be/ cua du an.');
  if (!['--check', '--apply'].includes(mode)) die('Cach dung: --check hoac --apply "DUONG_DAN_BACKUP"');
  if (!fs.existsSync(database) || !fs.existsSync(schema)) die('Khong tim thay ats.db hoac schema.prisma trong be/.');
  const schemaText = fs.readFileSync(schema, 'utf8');
  if (!/url\s*=\s*"file:\.\/ats\.db"/.test(schemaText)) die('Schema KHONG tro vao file:./ats.db; dung lai.');
  if (fs.existsSync(database + '-wal') || fs.existsSync(database + '-shm')) die('Phat hien WAL/SHM. Dung Backend/Prisma Studio, kiem tra lai.');
  if (mode === '--apply') {
    if (!backupArg) die('Can duong dan backup .db khi dung --apply.');
    const backup = path.resolve(backupArg);
    if (!fs.existsSync(backup) || path.resolve(backup) === path.resolve(database)) die('Backup khong hop le.');
    if (backup.toLowerCase().startsWith(backend.toLowerCase() + path.sep)) die('Backup phai nam NGOAI thu muc Backend.');
    const a = sha256(database), b = sha256(backup);
    if (a !== b) die('DB hien tai KHONG TRUNG KHOP backup SHA256. KHONG SUA. Hay sao luu lai sau khi dung moi ket noi.');
    console.log('BACKUP SHA256: TRUNG KHOP');
  }
}
function qi(s) { return '"' + s.replace(/"/g, '""') + '"'; }
async function columns(db, table) {
  const rows = await db.$queryRawUnsafe(`PRAGMA table_info(${qi(table)})`);
  return new Set(rows.map(r => r.name));
}
async function hasTable(db, table) {
  const rows = await db.$queryRawUnsafe('SELECT name FROM sqlite_master WHERE type=? AND name=?', 'table', table);
  return rows.length === 1;
}
async function counts(db) {
  const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const result = new Map();
  for (const row of tables) {
    const n = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM ${qi(row.name)}`);
    result.set(row.name, String(n[0].n));
  }
  return result;
}
async function checkIntegrity(db) {
  const res = await db.$queryRawUnsafe('PRAGMA integrity_check');
  if (!res.length || !res.every(row => Object.values(row).includes('ok'))) die('PRAGMA integrity_check KHONG DAT.');
}
async function inspect(db) {
  for (const t of requiredTables) if (!(await hasTable(db, t))) die('Thieu bang nen tang: ' + t);
  const missing = [];
  for (const [table, fields] of Object.entries(additions)) {
    const found = await columns(db, table);
    for (const [name] of fields) if (!found.has(name)) missing.push(`${table}.${name}`);
  }
  const catExists = await hasTable(db, 'RecruitmentCategory');
  if (!catExists) missing.push('BANG RecruitmentCategory');
  else {
    const actual = await columns(db, 'RecruitmentCategory');
    const absent = categoryFields.filter(name => !actual.has(name));
    if (absent.length) die('RecruitmentCategory dang ton tai nhung thieu cot: ' + absent.join(', '));
  }
  return missing;
}
async function run() {
  ensureEnvironment();
  const prisma = new PrismaClient({datasources:{db:{url:'file:./ats.db'}},log:['error']});
  try {
    await checkIntegrity(prisma);
    const missing = await inspect(prisma);
    console.log('CAC MUC CON THIEU (' + missing.length + '): ' + (missing.join(', ') || 'KHONG'));
    if (mode === '--check') {
      console.log('CHI KIEM TRA - KHONG THAY DOI DATABASE.');
      return;
    }
    const before = await counts(prisma);
    const fkBefore = (await prisma.$queryRawUnsafe('PRAGMA foreign_key_check')).length;
    await prisma.$transaction(async tx => {
      for (const [table, fields] of Object.entries(additions)) {
        const existing = await columns(tx, table);
        for (const [name, def] of fields) if (!existing.has(name)) {
          await tx.$executeRawUnsafe(`ALTER TABLE ${qi(table)} ADD COLUMN ${qi(name)} ${def}`);
          console.log('THEM COT: ' + table + '.' + name);
        }
      }
      if (!(await hasTable(tx, 'RecruitmentCategory'))) {
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
      await tx.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "RecruitmentCategory_category_name_key" ON "RecruitmentCategory"("category", "name")');
      await tx.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "RecruitmentCategory_category_position_idx" ON "RecruitmentCategory"("category", "position")');
      const after = await counts(tx);
      for (const [table, oldNumber] of before) {
        if (after.get(table) !== oldNumber) die('So ban ghi da thay doi tai bang ' + table);
      }
      await checkIntegrity(tx);
      const fkAfter = (await tx.$queryRawUnsafe('PRAGMA foreign_key_check')).length;
      if (fkAfter > fkBefore) die(`Loi khoa ngoai tang: ${fkBefore} -> ${fkAfter}`);
    }, {timeout:30000});
    const remain = await inspect(prisma);
    if (remain.length) die('Van thieu: ' + remain.join(', '));
    console.log('\nTHANH CONG: CHI BO SUNG BANG/COT, KHONG XOA DU LIEU HAY BANG CU.');
    console.log('SO BANG CU KIEM TRA: ' + before.size + '. So ban ghi khong thay doi.');
    console.log('PRAGMA integrity_check: ok. Foreign key error truoc: ' + fkBefore);
    console.log('LUU Y: Khac biet index/FK voi Prisma Schema co the van ton tai; KHONG tu y db push.');
  } finally { await prisma.$disconnect(); }
}
run().catch(err => { console.error('DUNG LAI:', err.message); process.exitCode=1; });
