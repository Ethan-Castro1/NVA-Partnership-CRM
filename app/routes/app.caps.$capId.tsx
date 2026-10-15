/**
 * One CAP: its details, partners (inline status/role/note) and suggested
 * partners from the village. Owners and admins can edit (?edit=1) or delete;
 * that rule is enforced in the action, not just by hiding buttons.
 */
import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { ArrowLeft, CalendarDays, Loader2, Network, Pencil, Sparkles, Trash2, UserRound } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.caps.$capId";
import { BlockChips, CapLabels, CapStatusBadge, TopicList, useTopicLabel } from "~/components/caps/cap-bits";
import { CapForm } from "~/components/caps/cap-form";
import { PartnerRow, SuggestionItem } from "~/components/caps/cap-partners";
import { EmptyState, PageHeader, Panel, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { makeT, useT, type MessageKey } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import {
  addCapPartner,
  canEditCap,
  deleteCap,
  getCap,
  getCapPartners,
  getCapSuggestions,
  parseCapForm,
  parsePartnerUpdate,
  removeCapPartner,
  updateCap,
  updateCapPartner,
  type CapSummary,
} from "~/lib/caps.server";
import { getPerson } from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches, data: loaderData }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const title = loaderData?.cap.title ?? t("caps.title");
  return [{ title: `${title} | ${t("common.schoolName")}` }];
};

async function loadCap(request: Request, capId: string) {
  const user = await requireUser(request);
  const cap = await getCap(capId);
  if (!cap) throw new Response("Not found", { status: 404 });
  return { user, cap, canEdit: canEditCap(cap, user) };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { cap, canEdit } = await loadCap(request, params.capId);
  const editing = canEdit && new URL(request.url).searchParams.get("edit") === "1";
  const [partners, suggestions] = await Promise.all([
    getCapPartners(cap.id),
    editing ? Promise.resolve([]) : getCapSuggestions(cap),
  ]);
  return { cap, canEdit, editing, partners, suggestions };
}

const personIdSchema = z.string().min(1).max(100);

export async function action({ request, params }: Route.ActionArgs) {
  const { user, cap, canEdit } = await loadCap(request, params.capId);
  const form = await request.formData();
  const intent = form.get("intent");

  switch (intent) {
    case "update": {
      if (!canEdit) throw new Response("Forbidden", { status: 403 });
      const parsed = parseCapForm(form);
      if (!parsed.ok) return data({ ok: false as const, errors: parsed.errors }, { status: 400 });
      await updateCap(cap.id, parsed.value);
      return redirect(`/app/caps/${cap.id}`);
    }
    case "delete": {
      if (!canEdit) throw new Response("Forbidden", { status: 403 });
      await deleteCap(cap.id);
      return redirect("/app/caps");
    }
    case "add-partner": {
      const personId = personIdSchema.safeParse(form.get("personId"));
      if (!personId.success) throw new Response("Bad request", { status: 400 });
      if (!(await getPerson(personId.data))) {
        return data({ ok: false as const, error: "caps.error.personNotFound" as MessageKey }, { status: 404 });
      }
      await addCapPartner({ capId: cap.id, personId: personId.data }, user.id);
      return data({ ok: true as const });
    }
    case "update-partner": {
      const input = parsePartnerUpdate(form);
      if (!input) throw new Response("Bad request", { status: 400 });
      await updateCapPartner(cap.id, input.personId, input);
      return data({ ok: true as const });
    }
    case "remove-partner": {
      const personId = personIdSchema.safeParse(form.get("personId"));
      if (!personId.success) throw new Response("Bad request", { status: 400 });
      await removeCapPartner(cap.id, personId.data);
      return data({ ok: true as const });
    }
    default:
      throw new Response("Bad request", { status: 400 });
  }
}

/** A question for the AI assistant, built from the CAP's title, topics and needs. */
function useAskQuestion(cap: Pick<CapSummary, "title" | "topics" | "needs">): string {
  const { t } = useT();
  const topicLabel = useTopicLabel();
  return [
    t("caps.detail.askQuestion", { title: cap.title }),
    cap.topics.length ? t("caps.detail.askTopics", { topics: cap.topics.map(topicLabel).join(", ") }) : null,
    cap.needs ? t("caps.detail.askNeeds", { needs: cap.needs }) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 900);
}

export default function CapDetail() {
  const { cap, canEdit, editing, partners, suggestions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useT();
  const askQuestion = useAskQuestion(cap);
  const connectionsQuery = (cap.needs?.trim() || cap.topics.join(", ")).slice(0, 200);

  if (editing) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <BackLink to={`/app/caps/${cap.id}`} label={cap.title} />
        <PageHeader eyebrow={t("caps.eyebrow")} title={t("caps.detail.editTitle")} />
        <Sheet className="p-6 md:p-8">
          <CapForm
            key={cap.id}
            defaults={cap}
            errors={actionData && "errors" in actionData ? actionData.errors : undefined}
            intent="update"
            submitLabel={t("common.action.saveChanges")}
            pendingLabel={t("common.state.saving")}
            cancelTo={`/app/caps/${cap.id}`}
          />
        </Sheet>
      </div>
    );
  }

  const total = partners.filter((p) => p.status !== "declined").length;
  const confirmed = partners.filter((p) => p.status === "confirmed").length;

  return (
    <div className="grid gap-8">
      <BackLink to="/app/caps" label={t("caps.detail.backToList")} />
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            {t("caps.eyebrow")}
            <CapStatusBadge status={cap.status} className="normal-case tracking-normal" />
          </span>
        }
        title={cap.title}
        description={cap.driving_question ?? undefined}
        actions={
          canEdit ? (
            <>
              <Button asChild variant="outline">
                <Link to="?edit=1">
                  <Pencil aria-hidden="true" />
                  {t("caps.detail.edit")}
                </Link>
              </Button>
              <DeleteCapButton title={cap.title} />
            </>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="brand" size="lg">
          <Link to={`/app/ask?q=${encodeURIComponent(askQuestion)}`}>
            <Sparkles aria-hidden="true" />
            {t("caps.detail.ask")}
          </Link>
        </Button>
        {connectionsQuery && (
          <Button asChild variant="outline" size="lg">
            <Link to={`/app/connections?q=${encodeURIComponent(connectionsQuery)}`}>
              <Network aria-hidden="true" />
              {t("caps.detail.findConnections")}
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Panel title={t("caps.detail.description")}>
            <dl className="grid gap-5 text-sm">
              {(cap.blocks.length > 0 || cap.labels.length > 0) && (
                <div className="grid gap-1.5">
                  <dt className="text-eyebrow text-smoke">{t("caps.detail.blocks")}</dt>
                  <dd className="grid gap-2">
                    <BlockChips blocks={cap.blocks} />
                    <CapLabels labels={cap.labels} />
                  </dd>
                </div>
              )}
              {cap.description && (
                <div className="grid gap-1">
                  <dt className="sr-only">{t("caps.detail.description")}</dt>
                  <dd className="leading-relaxed whitespace-pre-line text-graphite">{cap.description}</dd>
                </div>
              )}
              {cap.impact && (
                <div className="grid gap-1">
                  <dt className="text-eyebrow text-smoke">{t("caps.detail.impact")}</dt>
                  <dd className="leading-relaxed whitespace-pre-line text-graphite">{cap.impact}</dd>
                </div>
              )}
              <div className="grid gap-1">
                <dt className="text-eyebrow text-smoke">{t("caps.detail.needs")}</dt>
                <dd className="leading-relaxed whitespace-pre-line text-graphite">{cap.needs ?? t("caps.detail.notSet")}</dd>
              </div>
              <div className="grid gap-1.5">
                <dt className="text-eyebrow text-smoke">{t("caps.detail.topics")}</dt>
                <dd>{cap.topics.length ? <TopicList topics={cap.topics} /> : <span className="text-smoke">{t("caps.detail.notSet")}</span>}</dd>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-1">
                  <dt className="text-eyebrow text-smoke">{cap.teacher ? t("caps.detail.teacher") : t("caps.detail.owner")}</dt>
                  <dd className="flex items-center gap-1.5 text-graphite">
                    <UserRound className="size-4 text-smoke" aria-hidden="true" />
                    {cap.teacher ?? cap.owner_name ?? t("caps.card.noOwner")}
                  </dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-eyebrow text-smoke">{t("caps.detail.term")}</dt>
                  <dd className="flex items-center gap-1.5 text-graphite">
                    <CalendarDays className="size-4 text-smoke" aria-hidden="true" />
                    {cap.term ?? t("caps.detail.notSet")}
                  </dd>
                </div>
              </div>
            </dl>
          </Panel>

          <Panel
            title={t("caps.partners.title")}
            action={<span className="text-sm text-smoke">{t("caps.partners.count", { confirmed, total })}</span>}
          >
            <Sheet className="py-1">
              {partners.length ? (
                <ul className="divide-y divide-stone">
                  {partners.map((partner) => (
                    <PartnerRow key={partner.person.id} partner={partner} />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-smoke">{t("caps.partners.empty")}</p>
              )}
            </Sheet>
          </Panel>
        </div>

        <Panel title={t("caps.suggest.title")} className="min-w-0">
          <p className="-mt-2 mb-2 text-sm text-smoke">{t("caps.suggest.description")}</p>
          {suggestions.length ? (
            <ul className="divide-y divide-stone">
              {suggestions.map((suggestion) => (
                <SuggestionItem key={suggestion.person.id} suggestion={suggestion} />
              ))}
            </ul>
          ) : (
            <EmptyState title={t("caps.suggest.empty")} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex w-fit items-center gap-1.5 text-sm text-graphite hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function DeleteCapButton({ title }: { title: string }) {
  const { t } = useT();
  const navigation = useNavigation();
  const deleting = navigation.state === "submitting" && navigation.formData?.get("intent") === "delete";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 aria-hidden="true" />
          {t("caps.detail.delete")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("caps.detail.deleteConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("caps.detail.deleteConfirmBody", { title })}</DialogDescription>
        </DialogHeader>
        <Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.action.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {deleting ? t("caps.detail.deleting") : t("caps.detail.deleteConfirm")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
