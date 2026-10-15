/**
 * /mcp/<key>: the MCP connector endpoint for Claude, ChatGPT and other MCP
 * clients. The key in the URL is a personal key from /app/connect; it decides
 * whose search this is. See app/lib/ai/mcp.server.ts.
 */
import type { Route } from "./+types/mcp.$key";
import { handleMcpRequest } from "~/lib/ai/mcp.server";
import { whenReady } from "~/lib/db.server";
import { userForMcpKey } from "~/lib/mcp-keys.server";

async function handle(request: Request, key: string): Promise<Response> {
  await whenReady();
  const user = await userForMcpKey(key);
  if (!user) return Response.json({ error: "Unknown or revoked key" }, { status: 401 });
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  return handleMcpRequest(request, user, `${proto}://${host}`);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return handle(request, params.key);
}

export async function action({ request, params }: Route.ActionArgs) {
  return handle(request, params.key);
}
