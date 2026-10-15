/** For the load balancer: 200 when the server is up. */
export function loader() {
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
