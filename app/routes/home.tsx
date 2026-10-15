/**
 * "/" goes straight to the sign-up form: most visitors come from a link or a
 * flyer to join. Staff reach the app from the form's "Staff sign in" button.
 */
import { redirect } from "react-router";

export function loader() {
  return redirect("/join");
}
