/**
 * "/" goes straight to the sign-up form: most visitors come from a link or a
 * flyer to join. The short welcome page is at /home.
 */
import { redirect } from "react-router";

export function loader() {
  return redirect("/join");
}
