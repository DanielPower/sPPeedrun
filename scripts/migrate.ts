// Creates the target database if it doesn't exist, then applies db/schema.sql.
// Portable across dev (local psql-18) and prod (Docker) since it only uses the
// `postgres` driver over TCP.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const url = new URL(DATABASE_URL);
const dbName = url.pathname.replace(/^\//, "");
if (!dbName) {
  console.error("DATABASE_URL must include a database name");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");

async function main() {
  // Connect to the default maintenance database to (maybe) create ours.
  const adminUrl = new URL(DATABASE_URL as string);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1 });
  try {
    const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (exists.length === 0) {
      // Identifiers can't be parameterised; dbName comes from our own env.
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`Created database "${dbName}"`);
    } else {
      console.log(`Database "${dbName}" already exists`);
    }
  } finally {
    await admin.end();
  }

  const sql = postgres(DATABASE_URL as string, { max: 1 });
  try {
    await sql.unsafe(schema);
    console.log("Applied db/schema.sql");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
