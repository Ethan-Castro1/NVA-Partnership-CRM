/**
 * Pieces of the staff accounts page: the temporary password field with its
 * Generate button, and the per-account actions (role, active, reset password).
 * Each action posts to the users route with an "intent".
 */
import { useEffect, useId, useState } from "react";
import { useFetcher } from "react-router";
import { KeyRound, MoreHorizontal, Power, RefreshCw } from "lucide-react";
import { generatePassword } from "~/components/admin/format";
import { Field } from "~/components/nva";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useT, type MessageKey } from "~/i18n";
import { ROLES, type Role } from "~/lib/constants";

export type StaffActionResult =
  | { ok: true; done: "created" | "role" | "deactivated" | "reactivated" | "reset"; name?: string }
  | { ok: false; error: MessageKey; field?: "name" | "email" | "password" };

/** Text input for a temporary password, plus a button that fills in a random one. */
export function TempPasswordField({
  id,
  minLength,
  error,
  value,
  onChange,
}: {
  id: string;
  minLength: number;
  error?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useT();
  const [announce, setAnnounce] = useState("");
  return (
    <Field label={t("admin.users.tempPassword")} htmlFor={id} hint={t("admin.users.passwordHint", { min: minLength })} error={error}>
      <div className="flex gap-2">
        <Input
          id={id}
          name="password"
          type="text"
          autoComplete="new-password"
          spellCheck={false}
          required
          minLength={minLength}
          maxLength={200}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="font-mono"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onChange(generatePassword(14));
            setAnnounce(t("admin.users.generated"));
          }}
        >
          <RefreshCw aria-hidden="true" />
          {t("admin.users.generate")}
        </Button>
      </div>
      <span className="sr-only" role="status">
        {announce}
      </span>
    </Field>
  );
}

function ResultMessage({ result }: { result: StaffActionResult | undefined }) {
  const { t } = useT();
  if (!result) return null;
  if (!result.ok)
    return (
      <p role="alert" className="text-xs font-medium text-destructive">
        {t(result.error)}
      </p>
    );
  if (result.done !== "role" && result.done !== "deactivated" && result.done !== "reactivated") return null;
  return (
    <p role="status" className="text-xs text-sage-ink">
      {t(`admin.users.done.${result.done}`)}
    </p>
  );
}

/** Role picker, active toggle and reset-password dialog for one account. */
export function StaffActions({
  user,
  isSelf,
  minLength,
  passwords = true,
}: {
  user: { id: string; name: string; role: Role; active: boolean };
  isSelf: boolean;
  minLength: number;
  /** False with Sign in with Playlab: no reset-password item. */
  passwords?: boolean;
}) {
  const { t } = useT();
  const roleFetcher = useFetcher<StaffActionResult>();
  const activeFetcher = useFetcher<StaffActionResult>();
  const selectId = useId();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Show the role the admin just picked while the request runs.
  const pendingRole = roleFetcher.formData?.get("role") as Role | undefined;
  const role = pendingRole ?? user.role;
  const result = roleFetcher.state === "idle" ? roleFetcher.data : undefined;
  const activeResult = activeFetcher.state === "idle" ? activeFetcher.data : undefined;
  const toggleActive = () =>
    activeFetcher.submit({ intent: "active", userId: user.id, active: user.active ? "false" : "true" }, { method: "post" });

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex items-center gap-1">
        <label htmlFor={selectId} className="sr-only">
          {t("admin.users.roleFor", { name: user.name })}
        </label>
        <Select
          value={role}
          disabled={isSelf || roleFetcher.state !== "idle"}
          onValueChange={(value) => roleFetcher.submit({ intent: "role", userId: user.id, role: value }, { method: "post" })}
        >
          <SelectTrigger id={selectId} size="sm" className="min-w-28 bg-canvas">
            <SelectValue>{t(`common.role.${role}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`common.role.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={activeFetcher.state !== "idle"}
              aria-label={t("admin.users.moreFor", { name: user.name })}
              title={t("admin.users.moreFor", { name: user.name })}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {passwords && (
              <DropdownMenuItem
                onSelect={() => {
                  setResetDone(false);
                  setResetOpen(true);
                }}
              >
                <KeyRound aria-hidden="true" />
                {t("admin.users.resetPassword")}
              </DropdownMenuItem>
            )}
            {!isSelf && (
              <DropdownMenuItem variant={user.active ? "destructive" : "default"} onSelect={toggleActive}>
                <Power aria-hidden="true" />
                {user.active ? t("admin.users.deactivate") : t("admin.users.reactivate")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ResetPasswordDialog user={user} minLength={minLength} open={resetOpen} onOpenChange={setResetOpen} onDone={() => setResetDone(true)} />
      {resetDone && (
        <p role="status" className="text-xs text-sage-ink">
          {t("admin.users.done.reset")}
        </p>
      )}
      <ResultMessage result={result} />
      <ResultMessage result={activeResult} />
    </div>
  );
}

function ResetPasswordDialog({
  user,
  minLength,
  open,
  onOpenChange,
  onDone,
}: {
  user: { id: string; name: string };
  minLength: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const fetcher = useFetcher<StaffActionResult>();
  const [password, setPassword] = useState("");
  const inputId = useId();
  const result = fetcher.state === "idle" ? fetcher.data : undefined;

  // Close the dialog after a successful reset and say so under the row's actions.
  useEffect(() => {
    if (result?.ok) {
      onOpenChange(false);
      setPassword("");
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const error = result && !result.ok ? t(result.error, { min: minLength }) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="rounded-card">
        <fetcher.Form method="post" className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{t("admin.users.resetTitle", { name: user.name })}</DialogTitle>
            <DialogDescription>{t("admin.users.resetHint")}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="intent" value="reset" />
          <input type="hidden" name="userId" value={user.id} />
          <TempPasswordField id={inputId} minLength={minLength} value={password} onChange={setPassword} error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("common.action.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={fetcher.state !== "idle"}>
              {fetcher.state !== "idle" ? t("common.state.saving") : t("admin.users.resetSubmit")}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
