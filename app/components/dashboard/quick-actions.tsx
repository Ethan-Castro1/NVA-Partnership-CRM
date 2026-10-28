/**
 * Admin quick actions: add a contact (the screen's one gold button) and a "New"
 * menu for record an interaction, create a follow-up and draft an email.
 * Record and draft ask for the person, then the dashboard action sends you to
 * their profile's log form or their email page.
 */
import { useId, useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { CalendarPlus, ChevronDown, Mail, NotebookPen, Plus, UserPlus } from "lucide-react";
import { CrmSelect, QuickFollowUpForm } from "~/components/crm";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Label } from "~/components/ui/label";
import { useT } from "~/i18n";
import type { NamedOption, PersonOption } from "~/lib/opportunities.server";

type PickIntent = "record" | "draft";
type Open = null | PickIntent | "followUp";

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
  const [open, setOpen] = useState<Open>(null);
  const close = (next: boolean) => !next && setOpen(null);

  return (
    <div role="group" aria-label={t("dashboard.quick.label")} data-tour="quick-actions" className="flex flex-wrap items-center gap-2">
      <Button asChild variant="brand">
        <Link to="/app/people/new">
          <UserPlus aria-hidden="true" />
          {t("dashboard.quick.addContact")}
        </Link>
      </Button>
      {/* Not modal, so the dialog it opens gets focus cleanly when the menu closes. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Plus aria-hidden="true" />
            {t("dashboard.quick.new")}
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setOpen("record")}>
            <NotebookPen aria-hidden="true" />
            {t("dashboard.quick.record")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("followUp")}>
            <CalendarPlus aria-hidden="true" />
            {t("dashboard.quick.followUp")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("draft")}>
            <Mail aria-hidden="true" />
            {t("dashboard.quick.draft")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "followUp"} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dashboard.quick.followUp")}</DialogTitle>
            <DialogDescription className="sr-only">{t("dashboard.followUp.body")}</DialogDescription>
          </DialogHeader>
          <QuickFollowUpForm today={today} people={people} owners={owners} defaultOwnerId={defaultOwnerId} onDone={() => setOpen(null)} />
        </DialogContent>
      </Dialog>
      <PersonPicker intent="record" people={people} open={open === "record"} onOpenChange={close} />
      <PersonPicker intent="draft" people={people} open={open === "draft"} onOpenChange={close} />
    </div>
  );
}

/** "Choose a person", then posts to the dashboard action, which redirects. */
function PersonPicker({
  intent,
  people,
  open,
  onOpenChange,
}: {
  intent: PickIntent;
  people: PersonOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const id = useId();
  const navigation = useNavigation();
  const actionData = useActionData<{ intent?: string; error?: string }>();
  const failed = actionData?.intent === intent && actionData.error;
  const busy = navigation.state !== "idle" && navigation.formData?.get("intent") === intent;
  const title = intent === "record" ? t("dashboard.quick.record") : t("dashboard.quick.draft");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
