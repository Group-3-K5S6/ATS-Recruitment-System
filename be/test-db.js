require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function testDatabase() {
  console.log("=================================");
  console.log(" TEST POSTGRESQL + PRISMA");
  console.log("=================================");

  try {
    const result = await prisma.$queryRaw`
      SELECT
        current_database() AS database,
        current_user AS username,
        version() AS version
    `;

    console.log("\nKET NOI THANH CONG!");
    console.log("Database :", result[0].database);
    console.log("User     :", result[0].username);
    console.log("Postgres :", result[0].version);

    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;

    console.log("\nDANH SACH BANG:");

    if (tables.length === 0) {
      console.log("Chua co bang nao.");
    } else {
      tables.forEach((table, index) => {
        console.log(`${index + 1}. ${table.table_name}`);
      });
    }

    console.log("\n=================================");
    console.log(" DATABASE TEST: PASS");
    console.log("=================================");

  } catch (error) {
    console.log("\n=================================");
    console.log(" DATABASE TEST: FAIL");
    console.log("=================================");
    console.error(error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();