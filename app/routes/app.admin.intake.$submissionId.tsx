import type { Route } from "./+types/app.admin.intake.$submissionId";
import { PageHeader } from "~/components/nva";
import { requireAdmin } from "~/lib/auth.server";

// Placeholder: built in the feature pass.
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export default function Page() {
  return <PageHeader title="Sign-up" />;
}
