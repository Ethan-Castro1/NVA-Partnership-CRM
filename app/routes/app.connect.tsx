/**
 * "Use in Claude or ChatGPT": each staff member makes a personal connector
 * link (/mcp/<key>) to add as a custom connector. The full link is shown
 * once; afterwards only its name and dates are listed, and it can be turned off.
 */
import { useState } from "react";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { ArrowLeft, Check, Copy, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Route } from "./+types/app.connect";
import { Field, PageHeader, Panel, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { createMcpKey, listMcpKeys, revokeMcpKey } from "~/lib/mcp-keys.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("account.connect.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { keys: await listMcpKeys(user.id) };
}

type ActionResult = { created?: string; tooMany?: boolean; revoked?: boolean };

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  if (form.get("intent") === "revoke") {
    await revokeMcpKey(user.id, String(form.get("id") ?? ""));
    return data<ActionResult>({ revoked: true });
  }
  const key = await createMcpKey(user.id, String(form.get("label") ?? ""));
  if (!key) return data<ActionResult>({ tooMany: true }, { status: 400 });
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  return data<ActionResult>({ created: `${proto}://${host}/mcp/${key}` });
}

export default function Connect() {
  const { keys } = useLoaderData<typeof loader>();
  const { t, locale } = useT();
  const fetcher = useFetcher<ActionResult>();
  const created = fetcher.data?.created;
  const [copied, setCopied] = useState(false);
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="grid max-w-3xl gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 justify-self-start">
        <Link to="/app/account">
          <ArrowLeft aria-hidden="true" />
          {t("common.nav.account")}
        </Link>
      </Button>
      <PageHeader title={t("account.connect.title")} description={t("account.connect.description")} />

      {created ? (
        <Sheet className="grid gap-3 ring-2 ring-gold">
          <h2 className="text-section">{t("account.connect.newTitle")}</h2>
          <code className="block overflow-x-auto rounded-xl bg-taupe px-3 py-2.5 text-sm break-all">{created}</code>
          <p className="text-sm text-smoke">{t("account.connect.newHint")}</p>
          <Button
            type="button"
            variant="brand"
            className="justify-self-start"
            onClick={() =>
              void navigator.clipboard.writeText(created).then(() => {
                setCopied(true);
                toast.success(t("account.connect.copied"));
              })
            }
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {t("account.connect.copy")}
          </Button>
        </Sheet>
      ) : (
        <Panel>
          <fetcher.Form method="post" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="intent" value="create" />
            <Field label={t("account.connect.labelField")} htmlFor="connect-label" className="flex-1">
              <Input id="connect-label" name="label" maxLength={80} placeholder={t("account.connect.labelPlaceholder")} className="bg-canvas" />
            </Field>
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              <Plug aria-hidden="true" />
              {t("account.connect.create")}
            </Button>
          </fetcher.Form>
          {fetcher.data?.tooMany && (
            <p role="alert" className="mt-3 text-sm text-rust-ink">
              {t("account.connect.tooMany")}
            </p>
          )}
        </Panel>
      )}

      <Panel title={t("account.connect.howTitle")}>
        <ul className="grid gap-2 text-sm text-graphite">
          <li>{t("account.connect.howClaude")}</li>
          <li>{t("account.connect.howChatgpt")}</li>
        </ul>
      </Panel>

      <Panel title={t("account.connect.keysTitle")}>
        {keys.length === 0 ? (
          <p className="text-sm text-smoke">{t("account.connect.none")}</p>
        ) : (
          <ul className="grid gap-2">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center gap-3 rounded-xl bg-canvas px-3.5 py-2.5">
                <Plug className="size-4 shrink-0 text-smoke" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{key.label}</p>
                  <p className="text-xs text-smoke">
                    {t("account.connect.created", { date: date(key.created_at) })} ·{" "}
                    {key.last_used_at ? t("account.connect.lastUsed", { date: date(key.last_used_at) }) : t("account.connect.neverUsed")}
                  </p>
                </div>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="revoke" />
                  <input type="hidden" name="id" value={key.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    <Trash2 aria-hidden="true" />
                    {t("account.connect.revoke")}
                  </Button>
                </fetcher.Form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
