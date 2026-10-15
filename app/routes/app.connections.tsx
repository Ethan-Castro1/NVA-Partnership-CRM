/**
 * The connection finder: "who can get us to...?" Need search with intro paths
 * from the board and staff, the village map, and a web search for leads
 * beyond the network.
 */
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";
import { Loader2, Search } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.connections";
import { ConnectorCard } from "~/components/connections/connector-card";
import { VillageMap } from "~/components/connections/village-map";
import { WebLeadCard, WebSearchForm, type WebActionResult } from "~/components/connections/web-leads";
import { EmptyState, Field, PageHeader, Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { makeT, useT, type MessageKey } from "~/i18n";
import { getLocale } from "~/i18n/locale.server";
import { isAiConfigured } from "~/lib/ai/client.server";
import { dismissWebLead, findWebLeads, listWebLeads, saveWebLeadAsContact } from "~/lib/ai/web-leads.server";
import { requireUser } from "~/lib/auth.server";
import { getVillageMap, highlightFor, sortConnectorResults } from "~/lib/connections.server";
import { CONTRIBUTION_COLOR, CONTRIBUTION_TYPES, INNER_CIRCLE } from "~/lib/constants";
import { findConnectorsForNeed, searchPeople, searchTerms } from "~/lib/people.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("connections.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const typeParam = url.searchParams.get("type");
  const type = CONTRIBUTION_TYPES.find((value) => value === typeParam) ?? null;
  // A query of only stopwords ("someone") would match everyone, so treat it as empty.
  const searching = searchTerms(q).length > 0;

  const [results, map, inner, leads] = await Promise.all([
    searching ? findConnectorsForNeed({ q, contributionTypes: type ? [type] : undefined, limit: 25 }) : Promise.resolve([]),
    getVillageMap(),
    searchPeople({ affiliations: [...INNER_CIRCLE], limit: 100 }),
    listWebLeads(),
  ]);
  const sorted = sortConnectorResults(results);
  return {
    q,
    type,
    searching,
    results: sorted,
    highlight: highlightFor(sorted),
    map,
    innerCircle: inner.people
      .map((p) => ({ id: p.id, full_name: p.full_name }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    leads,
    aiConfigured: isAiConfigured(),
  };
}

const webSchema = z.object({
  need: z.string().trim().min(3, "connections.web.error.needTooShort").max(300, "connections.web.error.needTooLong"),
  via: z
    .string()
    .max(100)
    .nullish()
    .transform((v) => (v && v !== "none" ? v : null)),
});
const leadSchema = z.object({ leadId: z.string().min(1).max(100) });

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const locale = await getLocale(request, user.locale);

  if (intent === "web") {
    const parsed = webSchema.safeParse({ need: form.get("need") ?? "", via: form.get("via") });
    if (!parsed.success) {
      return data<WebActionResult>(
        { intent: "web", ok: false, error: parsed.error.issues[0].message as MessageKey, field: "need" },
        { status: 400 },
      );
    }
    const result = await findWebLeads({ need: parsed.data.need, via: parsed.data.via, locale, userId: user.id });
    if (!result.ok) {
      const status = result.error === "connections.web.error.rateLimited" ? 429 : result.error === "connections.web.error.viaInvalid" ? 400 : 503;
      return data<WebActionResult>(
        { intent: "web", ok: false, error: result.error, field: result.error === "connections.web.error.viaInvalid" ? "via" : undefined },
        { status },
      );
    }
    return data<WebActionResult>({ intent: "web", ok: true, count: result.count });
  }

  if (intent === "save-lead" || intent === "dismiss-lead") {
    const parsed = leadSchema.safeParse({ leadId: form.get("leadId") });
    if (!parsed.success) throw new Response("Bad request", { status: 400 });
    if (intent === "save-lead") {
      const personId = await saveWebLeadAsContact(parsed.data.leadId, user.id, locale);
      if (!personId) return data({ intent, ok: false, error: "connections.leads.error.gone" as MessageKey }, { status: 409 });
      return data({ intent, ok: true, personId });
    }
    const dismissed = await dismissWebLead(parsed.data.leadId);
    if (!dismissed) return data({ intent, ok: false, error: "connections.leads.error.gone" as MessageKey }, { status: 409 });
    return data({ intent, ok: true });
  }

  throw new Response("Bad request", { status: 400 });
}

const EXAMPLES = [
  { label: "connections.search.example1", q: "sewing" },
  { label: "connections.search.example2", q: "the bay" },
  { label: "connections.search.example3", q: "welding" },
] as const;

export default function Connections() {
  const { q, type, searching, results, highlight, map, innerCircle, leads, aiConfigured } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as WebActionResult | { intent: string } | undefined;
  const webResult = actionData?.intent === "web" ? (actionData as WebActionResult) : undefined;
  const { t } = useT();
  const navigation = useNavigation();
  const searchingNow = navigation.state === "loading" && navigation.location?.pathname === "/app/connections" && !navigation.formMethod?.match(/post/i);

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow={t("connections.eyebrow")} title={t("connections.title")} description={t("connections.description")} />

      <Panel>
        <Form method="get" role="search" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem_auto] md:items-end">
          <Field label={t("connections.search.label")} htmlFor="need-q">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-smoke" aria-hidden="true" />
              <Input
                id="need-q"
                key={q}
                name="q"
                defaultValue={q}
                maxLength={200}
                placeholder={t("connections.search.placeholder")}
                className="h-11 pl-10"
              />
            </div>
          </Field>
          <Field label={t("connections.search.typeLabel")} htmlFor="need-type">
            <Select key={type ?? "any"} name="type" defaultValue={type ?? "any"}>
              <SelectTrigger id="need-type" className="h-11 w-full bg-canvas">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("connections.search.typeAny")}</SelectItem>
                {CONTRIBUTION_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    <span className={cn("size-2 rounded-full", CONTRIBUTION_COLOR[value].dot)} aria-hidden="true" />
                    {t(`common.contribution.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" variant="brand" size="lg" className="h-11" disabled={searchingNow}>
            {searchingNow ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
            {searchingNow ? t("connections.search.searching") : t("connections.search.submit")}
          </Button>
        </Form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-smoke">{t("connections.search.tryLabel")}</span>
          {EXAMPLES.map((example) => (
            <Link
              key={example.q}
              to={`?q=${encodeURIComponent(example.q)}`}
              className="rounded-full border border-stone bg-canvas px-3 py-1 text-graphite transition-colors hover:border-gold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {t(example.label)}
            </Link>
          ))}
        </div>
      </Panel>

      {searching && (
        <section aria-labelledby="results-heading" className="grid gap-4">
          <div className="space-y-1">
            <h2 id="results-heading" className="text-section">
              {t("connections.results.title")}
            </h2>
            <p className="text-sm text-smoke" aria-live="polite">
              {results.length === 1
                ? t("connections.results.countOne", { q })
                : t("connections.results.count", { count: results.length, q })}
              {results.length > 0 && <> {t("connections.results.intro")}</>}
            </p>
          </div>
          {results.length ? (
            <div className="grid gap-4">
              {results.map((result) => (
                <ConnectorCard key={result.person.id} result={result} />
              ))}
            </div>
          ) : (
            <EmptyState title={t("connections.results.none")} body={t("connections.results.noneBody")} />
          )}
        </section>
      )}

      <Panel
        title={t("connections.map.title")}
        action={
          <span className="text-sm text-smoke">
            {t("connections.map.summary", { people: map.nodes.length, links: map.links.length })}
          </span>
        }
      >
        <p className="-mt-2 mb-4 text-sm text-smoke">{t("connections.map.description")}</p>
        <div className="rounded-card bg-canvas p-3 md:p-4">
          <VillageMap map={map} highlight={highlight} results={results} />
        </div>
      </Panel>

      <Panel title={t("connections.web.title")}>
        <p className="-mt-2 mb-4 max-w-3xl text-sm text-smoke">{t("connections.web.description")}</p>
        <WebSearchForm aiConfigured={aiConfigured} innerCircle={innerCircle} defaultNeed={q} result={webResult} />

        <section aria-labelledby="leads-heading" className="mt-8 grid gap-4">
          <div className="space-y-1">
            <h3 id="leads-heading" className="text-section">
              {t("connections.leads.title")}
            </h3>
            <p className="text-sm text-smoke">{t("connections.leads.unverifiedHelp")}</p>
          </div>
          {leads.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {leads.map((lead) => (
                <WebLeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          ) : (
            <EmptyState title={t("connections.leads.empty")} />
          )}
        </section>
      </Panel>
    </div>
  );
}
