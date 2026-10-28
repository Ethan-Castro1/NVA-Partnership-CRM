/**
 * The question box, in the shadcn AI Elements "Prompt Input" shape: an Input
 * Group with a growing textarea and a round send button that turns into Stop
 * while an answer streams. Enter sends; Shift+Enter adds a line.
 */
import { ArrowUp, Square } from "lucide-react";
import { useRef, type KeyboardEvent, type Ref } from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "~/components/ui/input-group";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { MAX_MESSAGE_CHARS } from "./types";

type PromptInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  /** Shown under the box (where answers come from, when the AI is off). */
  hint?: string;
  /** The bigger, centered box of an empty chat. */
  large?: boolean;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

export function PromptInput({ id, value, onChange, onSubmit, onStop, busy, hint, large = false, className, ref }: PromptInputProps) {
  const { t } = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const tooLong = value.length > MAX_MESSAGE_CHARS;
  const canSend = !busy && !!value.trim() && !tooLong;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
      className={cn("grid gap-1.5", className)}
    >
      <label htmlFor={id} className="sr-only">
        {t("assistant.inputLabel")}
      </label>
      {/* The group dims itself when anything inside is disabled; only the send button ever is, so keep it bright. */}
      <InputGroup className="rounded-3xl border-stone bg-canvas shadow-[0_8px_30px_-18px_rgba(0,0,0,0.35)] has-disabled:bg-canvas has-disabled:opacity-100 has-[[data-slot=input-group-control]:focus-visible]:border-gold has-[[data-slot=input-group-control]:focus-visible]:ring-gold/25">
        <InputGroupTextarea
          ref={ref}
          id={id}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("assistant.placeholder")}
          aria-invalid={tooLong || undefined}
          aria-describedby={tooLong || hint ? `${id}-hint` : undefined}
          className={cn("max-h-48 px-4 pt-3.5 text-[0.95rem]", large ? "min-h-20" : "min-h-12")}
        />
        <InputGroupAddon align="block-end" className="justify-end gap-2 px-3 pb-2.5">
          {busy ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="outline"
              className="ml-auto size-9 rounded-full"
              onClick={onStop}
              aria-label={t("assistant.stop")}
            >
              <Square className="fill-current" aria-hidden="true" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              size="icon-sm"
              className="ml-auto size-9 rounded-full bg-gold text-ink hover:bg-gold/85 disabled:bg-stone disabled:text-smoke disabled:opacity-100"
              disabled={!canSend}
              aria-label={t("assistant.send")}
            >
              <ArrowUp aria-hidden="true" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      {(tooLong || hint) && (
        <p id={`${id}-hint`} className={cn("px-2 text-center text-xs", tooLong ? "text-rust-ink" : "text-smoke")}>
          {tooLong ? t("assistant.errorTooLong") : hint}
        </p>
      )}
    </form>
  );
}
