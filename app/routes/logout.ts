import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { logout } from "~/lib/auth.server";

export async function action({ request }: Route.ActionArgs) {
  return redirect("/login", { headers: { "Set-Cookie": await logout(request) } });
}

export function loader() {
  return redirect("/app");
}
