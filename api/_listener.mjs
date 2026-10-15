import { createRequestListener } from "@remix-run/node-fetch-server";
import { createRequestHandler } from "react-router";

/**
 * The app's Node request listener for Vercel. (Files starting with "_" in
 * api/ aren't Vercel functions, so this is just a module.)
 *
 * Vercel ends HTTPS at its edge and hands the function plain HTTP. Trusting
 * its X-Forwarded-* headers keeps request URLs https://, which React Router
 * needs: it rejects form posts whose Origin doesn't match the request URL.
 */
export function vercelListener(build) {
  const handleRequest = createRequestHandler(build, "production");
  return createRequestListener((request) => handleRequest(request), { trustProxy: true });
}
