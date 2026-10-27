/**
 * The directory's filter bar. It is a plain GET form, so every result list is
 * a shareable URL and the shell's global search box (which sends ?q=) just
 * works. With JavaScript, toggles and selects apply as soon as they change and
 * "no filter" values are left out of the URL.
 *
 * Staff: search, ways to help, CAP topic, connection and language.
 * Admins also get status, categories, staff-directory visibility, contact
 * mode, relationship owner and how the record came in.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Form, Link, useLocation, useNavigate } from "react-router";
import { Languages, Search } from "lucide-react";
import { Field } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useT } from "~/i18n";
import { useTopicLabel } from "~/components/caps/cap-bits";
import {
  AFFILIATIONS,
  CONTACT_CATEGORIES,
  CONTACT_MODES,
  CONTRIBUTION_COLOR,
  CONTRIBUTION_TYPES,
  PERSON_SOURCES,
  PERSON_STATUSES,
  SUGGESTED_CAP_TOPICS,
} from "~/lib/constants";
import { cn } from "~/lib/utils";
import type { DirectorySearchParams, NamedOption } from "~/lib/directory.server";
import { NamedSelect } from "./named-select";

/** Select values that mean "no filter"; the server ignores them too. */
const NO_FILTER = new Set(["", "any", "current"]);

/** Staff never filter on funding. */
const STAFF_TYPES = CONTRIBUTION_TYPES.filter((type) => type !== "funder");

function cleanQuery(form: HTMLFormElement): string {
  const out = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (typeof value !== "string") continue;
    const v = value.trim();
    if (!NO_FILTER.has(v)) out.append(key, v);
  }
  return out.toString();
}

const pill =
  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-stone bg-canvas px-3.5 text-sm text-graphite transition-colors select-none hover:bg-taupe has-checked:border-ink has-checked:bg-gold-soft has-checked:text-ink has-focus-visible:ring-3 has-focus-visible:ring-ring/50";

export function DirectoryFilters({
  params,
  topics,
  isAdmin,
  owners = [],
}: {
  params: DirectorySearchParams;
  topics: string[];
  isAdmin: boolean;
  owners?: NamedOption[];
}) {
  const topicLabel = useTopicLabel();
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();

  // Remount (to pick up new defaults) only when the URL changed from outside
  // this form, e.g. the global search box or "Clear filters".
  const fromHere = useRef(false);
  const lastSearch = useRef(location.search);
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (location.search === lastSearch.current) return;
    lastSearch.current = location.search;
    if (fromHere.current) fromHere.current = false;
    else setFormKey((k) => k + 1);
  }, [location.search]);

  const apply = (form: HTMLFormElement) => {
    fromHere.current = true;
    const qs = cleanQuery(form);
    navigate(qs ? `/app/people?${qs}` : "/app/people", { preventScrollReset: true });
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply(event.currentTarget);
  };
  const onChange = (event: FormEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.type === "checkbox" || target.tagName === "SELECT") apply(event.currentTarget);
  };

  const adminExtras = !!(params.visibility || params.mode || params.owner || params.source || params.types.length);
  const filtered =
    params.q ||
    params.types.length ||
    params.aff ||
    params.status ||
    params.spanish ||
    params.topic ||
    params.categories.length ||
    adminExtras;
  // This semester's CAPs first, in the guide's order, then any older topics people still have.
  const known = [...SUGGESTED_CAP_TOPICS, ...topics.filter((topic) => !SUGGESTED_CAP_TOPICS.includes(topic))];
  const topicOptions = params.topic && !known.includes(params.topic) ? [params.topic, ...known] : known;

  const typePills = (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-eyebrow text-graphite">{t("directory.typesLabel")}</legend>
      <div className="flex flex-wrap gap-2">
        {(isAdmin ? CONTRIBUTION_TYPES : STAFF_TYPES).map((type) => (
          <label key={type} className={pill}>
            <input type="checkbox" name="type" value={type} defaultChecked={params.types.includes(type)} className="sr-only" />
            <span className={cn("size-2.5 rounded-full", CONTRIBUTION_COLOR[type].dot)} aria-hidden="true" />
            {t(`common.contribution.${type}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <section aria-labelledby="people-filters" className="rounded-card bg-taupe p-4 md:p-5">
      <h2 id="people-filters" className="sr-only">
        {t("directory.filtersHeading")}
      </h2>
      <Form key={formKey} method="get" action="/app/people" onSubmit={onSubmit} onChange={onChange} className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="people-q" className="sr-only">
              {t("directory.searchLabel")}
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-smoke" aria-hidden="true" />
            <Input
              id="people-q"
              name="q"
              type="search"
              maxLength={200}
              defaultValue={params.q}
              placeholder={isAdmin ? t("directory.searchPlaceholder") : t("directory.searchPlaceholderStaff")}
              className="h-11 rounded-full pl-10"
            />
          </div>
          {isAdmin && (
            <div className="sm:w-48">
              <label htmlFor="people-status" className="sr-only">
                {t("directory.statusLabel")}
              </label>
              <NamedSelect
                id="people-status"
                name="status"
                defaultValue={params.status || "current"}
                className="h-11 rounded-full data-[size=default]:h-11"
                options={[
                  { value: "current", label: t("directory.statusCurrent") },
                  ...PERSON_STATUSES.map((s) => ({ value: s, label: t(`common.status.${s}`) })),
                  { value: "all", label: t("directory.statusAll") },
                ]}
              />
            </div>
          )}
          <Button type="submit" size="lg" className="shrink-0">
            {t("common.action.search")}
          </Button>
        </div>

        {isAdmin ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-eyebrow text-graphite">{t("directory.categoriesLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {CONTACT_CATEGORIES.map((category) => (
                <label key={category} className={pill}>
                  <input
                    type="checkbox"
                    name="cat"
                    value={category}
                    defaultChecked={params.categories.includes(category)}
                    className="sr-only"
                  />
                  {t(`common.category.${category}`)}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          typePills
        )}

        <details open={!!(params.aff || params.topic || params.spanish || (isAdmin && adminExtras))} className="group">
          <summary className="w-fit cursor-pointer rounded-full text-sm font-medium text-graphite hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            {t("directory.moreFilters")}
          </summary>
          <div className="mt-3 grid gap-4">
            {isAdmin && typePills}
            {isAdmin && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("directory.visibilityLabel")} htmlFor="people-vis">
                  <NamedSelect
                    id="people-vis"
                    name="vis"
                    defaultValue={params.visibility || "any"}
                    options={[
                      { value: "any", label: t("directory.visibilityAny") },
                      { value: "on", label: t("directory.visibilityOn") },
                      { value: "off", label: t("directory.visibilityOff") },
                    ]}
                  />
                </Field>
                <Field label={t("directory.modeLabel")} htmlFor="people-mode">
                  <NamedSelect
                    id="people-mode"
                    name="mode"
                    defaultValue={params.mode || "any"}
                    options={[
                      { value: "any", label: t("directory.modeAny") },
                      ...CONTACT_MODES.map((m) => ({ value: m, label: t(`common.contactMode.${m}`) })),
                    ]}
                  />
                </Field>
                <Field label={t("directory.ownerLabel")} htmlFor="people-owner">
                  <NamedSelect
                    id="people-owner"
                    name="owner"
                    defaultValue={params.owner || "any"}
                    options={[{ value: "any", label: t("directory.ownerAny") }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
                  />
                </Field>
                <Field label={t("directory.sourceLabel")} htmlFor="people-source">
                  <NamedSelect
                    id="people-source"
                    name="source"
                    defaultValue={params.source || "any"}
                    options={[
                      { value: "any", label: t("directory.sourceAny") },
                      ...PERSON_SOURCES.map((s) => ({ value: s, label: t(`common.source.${s}`) })),
                    ]}
                  />
                </Field>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label={t("directory.affiliationLabel")} htmlFor="people-aff">
                <NamedSelect
                  id="people-aff"
                  name="aff"
                  defaultValue={params.aff || "any"}
                  options={[
                    { value: "any", label: t("directory.anyAffiliation") },
                    ...AFFILIATIONS.map((a) => ({ value: a, label: t(`common.affiliation.${a}`) })),
                  ]}
                />
              </Field>
              <Field label={t("directory.topicLabel")} htmlFor="people-topic">
                <NamedSelect
                  id="people-topic"
                  name="topic"
                  defaultValue={params.topic || "any"}
                  options={[
                    { value: "any", label: t("directory.anyTopic") },
                    ...topicOptions.map((topic) => ({ value: topic, label: topicLabel(topic) })),
                  ]}
                />
              </Field>
              <label className={cn(pill, "w-fit")}>
                <input type="checkbox" name="lang" value="es" defaultChecked={params.spanish} className="sr-only" />
                <Languages className="size-4" aria-hidden="true" />
                {t("directory.spanish")}
              </label>
            </div>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2 empty:hidden">
          <noscript>
            <Button type="submit" variant="outline" size="sm">
              {t("directory.apply")}
            </Button>
          </noscript>
          {filtered && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/people">{t("directory.clear")}</Link>
            </Button>
          )}
        </div>
      </Form>
    </section>
  );
}
