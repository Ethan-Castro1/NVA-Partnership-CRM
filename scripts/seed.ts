/**
 * Fills a LOCAL database with fictional demo data and three demo staff logins.
 *
 *   npm run seed            (stop `npm run dev` first: the local database allows one process)
 *   npm run seed -- --reset (wipe the local data first)
 *
 * Refuses to run against DATABASE_URL (a real database) unless --force.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { ensureDatabase } from "../app/lib/db.server";
import { DEMO_PASSWORD, seedDemoData } from "../app/lib/demo-seed.server";

const args = new Set(process.argv.slice(2));
if (process.env.DATABASE_URL && !args.has("--force")) {
  console.error("DATABASE_URL is set: refusing to seed demo data into a real database (pass --force to override).");
  process.exit(1);
}
if (args.has("--reset") && !process.env.DATABASE_URL) {
  rmSync(process.env.PGLITE_DIR ?? path.resolve(".data/pglite"), { recursive: true, force: true });
}

async function main() {
  await ensureDatabase();
  if (!(await seedDemoData())) {
    console.log("The database already has people. Run `npm run seed -- --reset` to start over.");
    return;
  }
  console.log(`Sign in at /login as admin@nva.test or teacher@nva.test (or maestra@nva.test, in Spanish) with password: ${DEMO_PASSWORD}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
