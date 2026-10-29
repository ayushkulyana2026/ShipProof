/**
 * Apply the Postgres schema (idempotent). The app also applies it on first use;
 * run this to set up or verify a database ahead of a deploy.
 *   DATABASE_URL=postgres://... npm run db:migrate
 */
import postgres from "postgres";
import { SCHEMA_SQL } from "../lib/server/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL first.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql.unsafe(SCHEMA_SQL);
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('leads','checkout_sessions','subscriptions','payments','webhook_events')
      order by table_name`;
    console.log(`Schema applied. Tables: ${tables.map((t) => t.table_name).join(", ")}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
