import type { Role } from "./constants";

/** The signed-in staff member, as pages and components see them. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: "en" | "es";
};
