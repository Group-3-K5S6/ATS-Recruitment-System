/* ATS Sprint 1–2 — READ-ONLY schema audit.
 * Run from be directory after `npx prisma generate`.
 * Does not read or print application rows, secrets or credentials.
 * No SQL modifications are executed.
 */
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  const tables = new Set(rows.map(x => String(x.name)));
  let tableCount = 0;
  let columnCount = 0;
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName || model.name;
    if (!tables.has(table)) {
      console.log(`THIEU BANG: ${table}`);
      tableCount++;
      continue;
    }
    const quoted = table.replace(/"/g, '""');
    const cols = await prisma.$queryRawUnsafe(`PRAGMA table_info("${quoted}")`);
    const actual = new Set(cols.map(x => String(x.name)));
    const missing = model.fields
      .filter(field => field.kind === 'scalar' || field.kind === 'enum')
      .map(field => field.dbName || field.name)
      .filter(fieldName => !actual.has(fieldName));
    if (missing.length) {
      console.log(`THIEU COT ${table}: ${missing.join(', ')}`);
      columnCount += missing.length;
    }
  }
  console.log(`TONG: ${tableCount} bang va ${columnCount} cot thieu.`);
  console.log('CHI KIEM TRA COT/BANG, KHONG SO SANH INDEX, FOREIGN KEY HOAC DU LIEU.');
  console.log('KHONG CO DU LIEU NAO BI THAY DOI.');
})().catch(error => {
  console.error('LOI KIEM TRA:', error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
