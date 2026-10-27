/**
 * Writing an email to one contact: start a draft (with AI or by hand), edit
 * it, and send it only after an explicit click and confirmation. After a
 * send, offer to create a follow-up.
 */
import { useId, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { CircleAlert, ListChecks, Send, Sparkles, Trash2 } from "lucide-react";
import type { EmailAccountView } from "~/lib/email/accounts.server";
import { DRAFT_PURPOSES } from "~/lib/email/purposes";
import type { DraftView } from "~/lib/email/store.server";
import { AiNotice, Field } from "~/components/nva";
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
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { useT, type Locale, type MessageKey } from "~/i18n";

const busyWith = (navigation: ReturnType<typeof useNavigation>, intent: string) =>
  navigation.state !== "idle" && navigation.formData?.get("intent") === intent;

export function ComposeStart({ aiOn, defaultLanguage }: { aiOn: boolean; defaultLanguage: Locale }) {
  const { t } = useT();
  const uid = useId();
  const navigation = useNavigation();
  const drafting = busyWith(navigation, "draft");
  const [purpose, setPurpose] = useState<(typeof DRAFT_PURPOSES)[number]>("follow_up");
  const [language, setLanguage] = useState<Locale>(defaultLanguage);

  return (
    <div className="grid gap-4">
      {aiOn ? (
        <Form method="post" className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("email.compose.purpose")} htmlFor={`${uid}-purpose`}>
              <Select name="purpose" value={purpose} onValueChange={(v) => setPurpose(v as typeof purpose)}>
                <SelectTrigger id={`${uid}-purpose`} className="h-10 w-full bg-canvas">
                  <SelectValue>{t(`email.purpose.${purpose}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DRAFT_PURPOSES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`email.purpose.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("email.compose.language")} htmlFor={`${uid}-language`}>
              <Select name="language" value={language} onValueChange={(v) => setLanguage(v === "es" ? "es" : "en")}>
                <SelectTrigger id={`${uid}-language`} className="h-10 w-full bg-canvas">
                  <SelectValue>{t(`common.lang.${language}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{t("common.lang.en")}</SelectItem>
                  <SelectItem value="es">{t("common.lang.es")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={t("email.compose.stated")} htmlFor={`${uid}-stated`} hint={t("email.compose.statedHint")} optional>
            <Textarea
              id={`${uid}-stated`}
              name="statedPurpose"
              rows={3}
              maxLength={800}
              placeholder={t("email.compose.statedPlaceholder")}
              className="bg-canvas"
            />
          </Field>
          <p className="text-xs text-smoke">{t("email.compose.grounding")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="draft" variant="brand" disabled={drafting}>
              <Sparkles aria-hidden="true" />
              {drafting ? t("email.compose.drafting") : t("email.compose.draftAi")}
            </Button>
            <Button type="submit" name="intent" value="blank" variant="outline" disabled={drafting}>
              {t("email.compose.blank")}
            </Button>
          </div>
        </Form>
      ) : (
        <div className="grid gap-3">
          <AiNotice />
          <p className="text-sm text-smoke">{t("email.compose.aiOff")}</p>
          <Form method="post">
            <Button type="submit" name="intent" value="blank" variant="outline">
              {t("email.compose.blank")}
            </Button>
          </Form>
        </div>
      )}
    </div>
  );
}

export type SendBlock = "demo" | "noMailbox" | "noAddress" | null;

const SEND_BLOCK_KEY: Record<Exclude<SendBlock, null>, MessageKey> = {
  demo: "email.send.disabledDemo",
  noMailbox: "email.send.disabledNoMailbox",
  noAddress: "email.send.disabledNoAddress",
};

export function DraftEditor({
  draft,
  to,
  accounts,
  sendBlock,
}: {
  draft: DraftView;
  to: string | null;
  accounts: EmailAccountView[];
  sendBlock: SendBlock;
}) {
  const { t } = useT();
  const uid = useId();
  const formId = `${uid}-draft`;
  const navigation = useNavigation();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const mailbox = accounts.find((a) => a.id === accountId)?.email_address ?? "";
  const figureFlags = draft.flags.filter((f) => f.startsWith("figure:"));
  const otherFlags = draft.flags.filter((f) => !f.startsWith("figure:"));

  return (
    <div className="grid gap-4">
      <Form method="post" id={formId} className="grid gap-4">
        <input type="hidden" name="draftId" value={draft.id} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-smoke">
          <span className="font-medium text-graphite">{t(`email.purpose.${draft.purpose}`)}</span>
          {draft.ai_generated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 font-medium text-gold-ink">
              <Sparkles className="size-3" aria-hidden="true" />
              {t("email.draft.aiBadge")}
            </span>
          )}
          {draft.ai_generated && <span>{t("email.draft.review")}</span>}
        </div>

        {(otherFlags.length > 0 || figureFlags.length > 0) && (
          <div className="grid gap-1.5 rounded-xl bg-rust-soft px-3.5 py-3 text-sm text-rust-ink" role="note">
            <p className="flex items-center gap-1.5 font-medium">
              <CircleAlert className="size-4" aria-hidden="true" />
              {t("email.draft.flags")}
            </p>
            <ul className="ml-5 list-disc space-y-0.5">
              {otherFlags.map((f) => (
                <li key={f}>{f}</li>
              ))}
              {figureFlags.map((f) => (
                <li key={f}>{t("email.draft.flagFigure", { value: f.slice("figure:".length) })}</li>
              ))}
            </ul>
          </div>
        )}

        <Field label={t("email.draft.subject")} htmlFor={`${uid}-subject`}>
          <Input id={`${uid}-subject`} name="subject" defaultValue={draft.subject} maxLength={300} required className="h-10 bg-canvas" />
        </Field>
        <Field label={t("email.draft.body")} htmlFor={`${uid}-body`}>
          <Textarea id={`${uid}-body`} name="body" defaultValue={draft.body} rows={14} maxLength={20000} required className="bg-canvas leading-relaxed" />
        </Field>

        {accounts.length > 1 && (
          <Field label={t("email.send.from")} htmlFor={`${uid}-from`}>
            <Select name="accountId" value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id={`${uid}-from`} className="h-10 w-full bg-canvas">
                <SelectValue>{mailbox}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.email_address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {accounts.length === 1 && <input type="hidden" name="accountId" value={accountId} />}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="intent" value="save" variant="outline" disabled={navigation.state !== "idle"}>
            {busyWith(navigation, "save") ? t("common.state.saving") : t("email.draft.save")}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" disabled={!!sendBlock || navigation.state !== "idle"}>
                <Send aria-hidden="true" />
                {t("email.send.button")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("email.send.confirmTitle")}</DialogTitle>
                <DialogDescription>{t("email.send.confirmBody", { to: to ?? "", mailbox })}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {t("email.send.cancel")}
                  </Button>
                </DialogClose>
                {/* The only way to send: this button, after the admin opened the dialog and confirmed. */}
                <input type="hidden" name="approve" value="yes" form={formId} />
                <Button type="submit" name="intent" value="send" form={formId} disabled={busyWith(navigation, "send")}>
                  <Send aria-hidden="true" />
                  {t("email.send.confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            type="submit"
            name="intent"
            value="discard"
            variant="ghost"
            formNoValidate
            disabled={navigation.state !== "idle"}
          >
            <Trash2 aria-hidden="true" />
            {t("email.draft.discard")}
          </Button>
        </div>
        {sendBlock && <p className="text-xs text-smoke">{t(SEND_BLOCK_KEY[sendBlock])}</p>}
      </Form>

      {draft.ai_generated && draft.facts_used.length > 0 && (
        <details className="rounded-xl border border-stone bg-canvas px-3.5 py-2.5 text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
            <ListChecks className="size-4" aria-hidden="true" />
            {t("email.draft.facts", { count: draft.facts_used.length })}
          </summary>
          <ul className="mt-2 ml-5 list-disc space-y-1 text-graphite">
            {draft.facts_used.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function FollowUpOffer({ personName, dueDefault, messageId, skipHref }: { personName: string; dueDefault: string; messageId: string | null; skipHref: string }) {
  const { t } = useT();
  const uid = useId();
  const firstName = personName.split(/\s+/)[0] || personName;
  return (
    <Form method="post" className="grid gap-4 rounded-card bg-canvas p-4 shadow-whisper">
      <h3 className="text-sm font-semibold">{t("email.followUp.title")}</h3>
      {messageId && <input type="hidden" name="messageId" value={messageId} />}
      <Field label={t("email.followUp.action")} htmlFor={`${uid}-action`}>
        <Input
          id={`${uid}-action`}
          name="action"
          required
          maxLength={300}
          defaultValue={t("email.followUp.actionDefault", { name: firstName })}
          className="h-10 bg-canvas"
        />
      </Field>
      <div className="flex flex-wrap items-end gap-4">
        <Field label={t("email.followUp.due")} htmlFor={`${uid}-due`}>
          <Input id={`${uid}-due`} type="date" name="dueOn" required defaultValue={dueDefault} className="h-10 bg-canvas" />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="awaiting" value="yes" defaultChecked className="size-4 accent-[var(--color-ink)]" />
          {t("email.followUp.awaiting")}
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="followup">
          {t("email.followUp.create")}
        </Button>
        <Button asChild variant="ghost">
          <Link to={skipHref}>{t("email.followUp.skip")}</Link>
        </Button>
      </div>
    </Form>
  );
}
