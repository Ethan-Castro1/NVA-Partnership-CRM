import type { Route } from "./+types/app.caps.$capId";
import { PageHeader } from "~/components/nva";
import { requireUser } from "~/lib/auth.server";

// Placeholder: built in the feature pass.
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

export default function Page() {
  return <PageHeader title="CAP" />;
}
