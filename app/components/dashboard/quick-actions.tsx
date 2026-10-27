/**
 * Admin quick actions: add a contact (the screen's one gold button), record an
 * interaction, create a follow-up, draft an email, review staff requests.
 * Record and draft ask for the person, then the dashboard action sends you to
 * their profile's log form or their email page.
 */
import { useId, useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { CalendarPlus, ClipboardCheck, Mail, NotebookPen, UserPlus } from "lucide-react";
import { CrmSelect, QuickFollowUpForm } from "~/components/crm";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { useT } from "~/i18n";
import type { NamedOption, PersonOption } from "~/lib/opportunities.server";

type PickIntent = "record" | "draft";

export function QuickActions({
  today,
  people,
  owners,
  defaultOwnerId,
}: {
  today: string;
  people: PersonOption[];
  owners: NamedOption[];
  defaultOwnerId: string;
}) {
  const { t } = useT();
  const [followUpOpen, setFollowUpOpen] = useState(false);

  return (
    <section aria-label={t("dashboard.quick.label")}>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Button asChild variant="brand">
            <Link to="/app/people/new">
              <UserPlus aria-hidden="true" />
              {t("dashboard.quick.addContact")}
            </Link>
          </Button>
        </li>
        <li>
          <PersonPicker intent="record" people={people} />
        </li>
        <li>
          <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <CalendarPlus aria-hidden="true" />
                {t("dashboard.quick.followUp")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("dashboard.quick.followUp")}</DialogTitle>
                <DialogDescription>{t("dashboard.followUp.body")}</DialogDescription>
              </DialogHeader>
              <QuickFollowUpForm
                today={today}
                people={people}
                owners={owners}
                defaultOwnerId={defaultOwnerId}
                onDone={() => setFollowUpOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </li>
        <li>
          <PersonPicker intent="draft" people={people} />
        </li>
        <li>
          <Button asChild variant="outline">
            <Link to="/app/admin/requests">
              <ClipboardCheck aria-hidden="true" />
              {t("dashboard.quick.review")}
            </Link>
          </Button>
        </li>
      </ul>
    </section>
  );
}

/** A button that opens "choose a person", then posts to the dashboard action, which redirects. */
function PersonPicker({ intent, people }: { intent: PickIntent; people: PersonOption[] }) {
  const { t } = useT();
  const id = useId();
  const navigation = useNavigation();
  const actionData = useActionData<{ intent?: string; error?: string }>();
  const failed = actionData?.intent === intent && actionData.error;
  const busy = navigation.state !== "idle" && navigation.formData?.get("intent") === intent;
  const title = intent === "record" ? t("dashboard.quick.record") : t("dashboard.quick.draft");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          {intent === "record" ? <NotebookPen aria-hidden="true" /> : <Mail aria-hidden="true" />}
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{intent === "record" ? t("dashboard.pick.recordBody") : t("dashboard.pick.draftBody")}</DialogDescription>
        </DialogHeader>
        {people.length === 0 ? (
          <p className="text-sm text-smoke">{t("dashboard.pick.noPeople")}</p>
        ) : (
          <Form method="post" className="grid gap-4">
            <input type="hidden" name="intent" value={intent} />
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-person`}>{t("dashboard.pick.label")}</Label>
              <CrmSelect
                id={`${id}-person`}
                name="personId"
                required
                placeholder={t("dashboard.pick.placeholder")}
                invalid={Boolean(failed)}
                describedBy={failed ? `${id}-error` : undefined}
                options={people.map((p) => ({
                  value: p.id,
                  label: p.organization_name ? `${p.full_name}, ${p.organization_name}` : p.full_name,
                }))}
              />
              {failed && (
                <p id={`${id}-error`} className="text-xs text-rust-ink">
                  {t("dashboard.pick.required")}
                </p>
              )}
            </div>
            <Button type="submit" className="justify-self-start" disabled={busy}>
              {t("dashboard.pick.continue")}
            </Button>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
