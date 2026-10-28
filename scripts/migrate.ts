/**
 * Applies the schema and data migrations (npm run db:migrate). The build bundles
 * this file into build/migrate.mjs so it runs in the production image, which has
 * no dev tools. On Easel the deploy runs it before each update (before_update in
 * .github/workflows/deploy.yml) with DATABASE_URL set to the database owner's.
 */
import { migrateDatabase } from "../app/lib/db.server";

await migrateDatabase();
console.log("[nva] Migrations applied.");
