import { query, whenReady } from "~/lib/db.server";

/**
 * For the load balancer: 200 once the server can use its database (schema in
 * place, startup done), 503 otherwise, so a pod that can't serve pages never
 * takes traffic.
 */
export async function loader() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await whenReady();
    await query("SELECT 1");
    return new Response("ok", { headers });
  } catch (error) {
    console.error("healthcheck: database not ready", error instanceof Error ? error.message : "unknown");
    return new Response("database not ready", { status: 503, headers });
  }
}
