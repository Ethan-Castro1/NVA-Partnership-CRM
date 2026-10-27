/**
 * One CAP as a partner pipeline: partners (inline status/role/note), the
 * activity logged against it, its details and possible partners. Everyone
 * signed in can read it (staff see only partners in the staff directory).
 * Only admins add, update or remove partners; only owners and admins edit
 * (?edit=1) or delete. Both rules are enforced in the action, not just by
 * hiding buttons.
 */
import { useEffect, useState } from "react";
import { Form, Link, data, redirect, useActionData, useFetcher, useLoaderData, useNavigation } from "react-router";
import { ArrowLeft, Loader2, MoreHorizontal, Network, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.caps.$capId";
import { formatDay } from "~/components/admin/format";
import { BlockChips, CapLabels, CapStatusBadge, useTopicLabel } from "~/components/caps/cap-bits";
import { CapForm } from "~/components/caps/cap-form";
import { PartnerRow, SuggestionItem } from "~/components/caps/cap-partners";
import { PageHeader, Panel, Sheet, TagList } from "~/components/nva";
import type { SelectOption } from "~/components/people/named-select";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { makeT, useT, type MessageKey } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import {
  addCapPartner,
  canEditCap,
  canManagePartners,
  deleteCap,
  getCap,
  getCapActivity,
  getCapPartnerOptions,
  getCapPartners,
  getCapSuggestions,
  parseCapForm,
  parsePartnerUpdate,
  removeCapPartner,
  updateCap,
  updateCapPartner,
} from "~/lib/caps.server";
import { canViewPerson } from "~/lib/permissions.server";
import { savedIdsAmong } from "~/lib/saved.server";

export const meta: Route.MetaFunction = ({ matches, data: loaderData }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const title = loaderData?.cap.title ?? t("caps.title");
  return [{ title: `${title} | ${t("common.schoolName")}` }];
};

async function loadCap(request: Request, capId: string) {
  const user = await requireUser(request);
  const cap = await getCap(capId, user);
  if (!cap) throw new Response("Not found", { status: 404 });
  return { user, cap, canEdit: canEditCap(cap, user), canManage: canManagePartners(user) };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { user, cap, canEdit, canManage } = await loadCap(request, params.capId);
  const editing = canEdit && new URL(request.url).searchParams.get("edit") === "1";
  // Everything about people is scoped to the viewer: staff see only the staff directory.
  const [partners, suggestions, activity, others] = await Promise.all([
    getCapPartners(cap.id, user),
    editing ? Promise.resolve([]) : getCapSuggestions(cap, user),
    editing ? Promise.resolve([]) : getCapActivity(cap.id, user),
    editing || !canManage ? Promise.resolve([]) : getCapPartnerOptions(cap.id, user),
  ]);
  const partnerOptions: SelectOption[] = others.map((p) => ({
    value: p.id,
    label: p.organization_name ? `${p.full_name}, ${p.organization_name}` : p.full_name,
  }));
  // Staff rows offer Save; admins manage partners instead.
  const saved = canManage
    ? new Set<string>()
    : await savedIdsAmong(user, [...partners.map((p) => p.person.id), ...suggestions.map((s) => s.person.id)]);
  return { cap, canEdit, canManage, editing, partners, suggestions, activity, partnerOptions, savedIds: [...saved] };
}

const personIdSchema = z.string().min(1).max(100);

export async function action({ request, params }: Route.ActionArgs) {
  const { user, cap, canEdit, canManage } = await loadCap(request, params.capId);
  const form = await request.formData();
  const intent = form.get("intent");
  // Partners are managed by admins only.
  if ((intent === "add-partner" || intent === "update-partner" || intent === "remove-partner") && !canManage) {
    throw new Response("Forbidden", { status: 403 });
  }

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
      if (!(await canViewPerson(user, personId.data))) {
        return data({ ok: false as const, error: "caps.error.personNotFound" as MessageKey }, { status: 404 });
      }
      await addCapPartner({ capId: cap.id, personId: personId.data }, user.id);
      return data({ ok: true as const });
    }
    case "update-partner": {
      const input = parsePartnerUpdate(form);
      if (!input) throw new Response("Bad request", { status: 400 });
      if (!(await canViewPerson(user, input.personId))) throw new Response("Not found", { status: 404 });
      await updateCapPartner(cap.id, input.personId, input);
      return data({ ok: true as const });
    }
    case "remove-partner": {
      const personId = personIdSchema.safeParse(form.get("personId"));
      if (!personId.success) throw new Response("Bad request", { status: 400 });
      if (!(await canViewPerson(user, personId.data))) throw new Response("Not found", { status: 404 });
      await removeCapPartner(cap.id, personId.data);
      return data({ ok: true as const });
    }
    default:
      throw new Response("Bad request", { status: 400 });
  }
}

export default function CapDetail() {
  const { cap, canEdit, canManage, editing, partners, suggestions, activity, partnerOptions, savedIds } = useLoaderData<typeof loader>();
  const saved = new Set(savedIds);
  const actionData = useActionData<typeof action>();
  const { t, locale } = useT();
  const connectionsQuery = (cap.needs?.trim() || cap.topics.join(", ")).slice(0, 200);
  const topicLabel = useTopicLabel();

  if (editing) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <BackLink to={`/app/caps/${cap.id}`} label={cap.title} />
        <PageHeader title={t("caps.detail.editTitle")} />
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
        <div className="flex justify-end border-t border-stone pt-4">
          <DeleteCapButton title={cap.title} />
        </div>
      </div>
    );
  }

  const countOf = (status: string) => partners.filter((p) => p.status === status).length;
  // A CAP's own catalog key doubles as its topic tag: leave out the one that just repeats the title.
  const topicLabels = cap.topics.map(topicLabel).filter((label) => label.trim().toLowerCase() !== cap.title.trim().toLowerCase());

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <BackLink to="/app/caps" label={t("caps.detail.backToList")} />
      <PageHeader
        title={cap.title}
        description={
          cap.status !== "active" || cap.driving_question ? (
            <>
              {cap.status !== "active" && <CapStatusBadge status={cap.status} className="mr-2 align-middle" />}
              {cap.driving_question}
            </>
          ) : undefined
        }
        actions={
          <>
            {canManage && <AddPartnerDialog options={partnerOptions} />}
            {canEdit ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t("caps.detail.more")} title={t("caps.detail.more")}>
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to="?edit=1">
                      <Pencil aria-hidden="true" />
                      {t("caps.detail.edit")}
                    </Link>
                  </DropdownMenuItem>
                  {connectionsQuery && (
                    <DropdownMenuItem asChild>
                      <Link to={`/app/connections?q=${encodeURIComponent(connectionsQuery)}&cap=${encodeURIComponent(cap.id)}`}>
                        <Network aria-hidden="true" />
                        {t("caps.detail.findConnections")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              connectionsQuery && (
                <Button asChild variant="outline">
                  <Link to={`/app/connections?q=${encodeURIComponent(connectionsQuery)}&cap=${encodeURIComponent(cap.id)}`}>
                    <Network aria-hidden="true" />
                    {t("caps.detail.findConnections")}
                  </Link>
                </Button>
              )
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Panel
            title={t("caps.partners.title")}
            action={
              partners.length > 0 && (
              <span className="text-sm text-smoke">
                {t("caps.partners.pipeline", {
                  suggested: countOf("suggested"),
                  contacted: countOf("contacted"),
                  confirmed: countOf("confirmed"),
                })}
              </span>
              )
            }
          >
            {partners.length ? (
            <Sheet className="py-1">
                <ul className="divide-y divide-stone">
                  {partners.map((partner) => (
                    <PartnerRow
                      key={partner.person.id}
                      partner={partner}
                      capId={cap.id}
                      editable={canManage}
                      saved={saved.has(partner.person.id)}
                    />
                  ))}
                </ul>
            </Sheet>
            ) : (
              <p className="text-sm text-smoke">{t(canManage ? "caps.partners.empty" : "caps.partners.emptyStaff")}</p>
            )}
          </Panel>

          <Panel title={t("caps.detail.activity")}>
            {activity.length ? (
              <ol className="relative grid gap-4 border-l border-stone pl-5">
                {activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-gold ring-4 ring-taupe" aria-hidden="true" />
                    <p className="text-sm">
                      <span className="font-medium">{t(`common.engagement.${a.kind}`)}</span>
                      {": "}
                      <Link to={`/app/people/${a.person_id}`} className="underline decoration-stone decoration-2 underline-offset-4 hover:decoration-gold">
                        {a.person_name}
                      </Link>
                    </p>
                    {a.notes && <p className="mt-0.5 line-clamp-2 text-sm text-smoke">{a.notes}</p>}
                    <p className="mt-1 text-xs text-smoke">
                      {formatDay(a.happened_on, locale)}
                      {a.user_name && <> · {t("caps.detail.activityBy", { name: a.user_name })}</>}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-smoke">{t("caps.detail.activityEmpty")}</p>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 gap-6">
          <Panel title={t("caps.detail.details")}>
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
              <div className="grid gap-1">
                <dt className="text-eyebrow text-smoke">{cap.teacher ? t("caps.detail.teacher") : t("caps.detail.owner")}</dt>
                <dd className="flex items-center gap-1.5 text-graphite">
                  <UserRound className="size-4 text-smoke" aria-hidden="true" />
                  {cap.teacher ?? cap.owner_name ?? t("caps.card.noOwner")}
                </dd>
              </div>
              {cap.term && (
                <div className="grid gap-1">
                  <dt className="text-eyebrow text-smoke">{t("caps.detail.term")}</dt>
                  <dd className="text-graphite">{cap.term}</dd>
                </div>
              )}
              {topicLabels.length > 0 && (
                <div className="grid gap-1.5">
                  <dt className="text-eyebrow text-smoke">{t("caps.detail.topics")}</dt>
                  <dd>
                    <TagList tags={topicLabels} />
                  </dd>
                </div>
              )}
              <div className="grid gap-1">
                <dt className="text-eyebrow text-smoke">{t("caps.detail.needs")}</dt>
                <dd className="leading-relaxed whitespace-pre-line text-graphite">
                  {cap.needs ??
                    (canEdit ? (
                      <Link to="?edit=1" className="underline decoration-stone decoration-2 underline-offset-4 hover:decoration-gold">
                        {t("caps.detail.needsEmpty")}
                      </Link>
                    ) : (
                      <span className="text-smoke">{t("caps.detail.notSet")}</span>
                    ))}
                </dd>
              </div>
            </dl>
            {(cap.description || cap.impact) && (
              <details className="group mt-5 border-t border-stone pt-4 text-sm">
                <summary className="cursor-pointer font-medium text-ink">{t("caps.detail.description")}</summary>
                <div className="mt-3 grid gap-4">
                  {cap.description && <p className="leading-relaxed whitespace-pre-line text-graphite">{cap.description}</p>}
                  {cap.impact && (
                    <div className="grid gap-1">
                      <p className="text-eyebrow text-smoke">{t("caps.detail.impact")}</p>
                      <p className="leading-relaxed whitespace-pre-line text-graphite">{cap.impact}</p>
                    </div>
                  )}
                </div>
              </details>
            )}
          </Panel>

          <Panel title={t("caps.suggest.title")}>
            {suggestions.length ? (
              <ul className="divide-y divide-stone">
                {suggestions.map((suggestion) => (
                  <SuggestionItem
                    key={suggestion.person.id}
                    suggestion={suggestion}
                    canAdd={canManage}
                    saved={saved.has(suggestion.person.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-smoke">{t("caps.suggest.empty")}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function AddPartnerDialog({ options }: { options: SelectOption[] }) {
  const { t } = useT();
  const fetcher = useFetcher<{ ok: boolean; error?: MessageKey }>();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // An error from an earlier attempt stays hidden once the dialog is closed.
  const [dismissed, setDismissed] = useState<unknown>(null);
  const adding = fetcher.state !== "idle";
  const error =
    fetcher.state === "idle" && fetcher.data && !fetcher.data.ok && fetcher.data !== dismissed ? fetcher.data.error : undefined;
  const words = search.trim().toLowerCase();
  const matches = (words ? options.filter((o) => o.label.toLowerCase().includes(words)) : options).slice(0, 50);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setOpen(false);
  }, [fetcher.state, fetcher.data]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setDismissed(fetcher.data ?? null);
      setSearch("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="brand">
          <Plus aria-hidden="true" />
          {t("caps.detail.addPartner")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("caps.detail.addPartnerTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("caps.detail.addPartnerPick")}</DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" className="grid gap-4">
          <input type="hidden" name="intent" value="add-partner" />
          <div className="grid gap-1.5">
            <Label htmlFor="add-partner-search">{t("caps.partners.person")}</Label>
            <Input
              id="add-partner-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("caps.detail.addPartnerPick")}
              autoComplete="off"
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "add-partner-error" : undefined}
            />
            <fieldset className="max-h-64 overflow-y-auto rounded-xl border border-stone">
              <legend className="sr-only">{t("caps.partners.person")}</legend>
              {matches.length ? (
                matches.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-stone px-3 py-2 text-sm last:border-b-0 hover:bg-taupe has-[:checked]:bg-gold-soft has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                  >
                    <input type="radio" name="personId" value={option.value} required className="accent-black" />
                    {option.label}
                  </label>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-smoke">{t("caps.detail.addPartnerNone")}</p>
              )}
            </fieldset>
            {error && (
              <p id="add-partner-error" className="text-sm text-destructive" role="alert">
                {t(error)}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.action.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={adding}>
              {adding && <Loader2 className="animate-spin" aria-hidden="true" />}
              {adding ? t("caps.suggest.adding") : t("caps.detail.addPartner")}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
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
        <Button variant="ghost" className="text-rust-ink">
          <Trash2 aria-hidden="true" />
          {t("caps.detail.deleteThis")}
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
