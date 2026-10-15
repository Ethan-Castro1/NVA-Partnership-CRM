/**
 * NVA building blocks shared by every page. Prefer these (and the shadcn
 * pieces in ./ui) over one-off styling so the app reads as one system:
 * eggshell page, taupe panels, hairline rules, pill buttons, gold as the
 * single spark, and the four contribution colours as small dots.
 */
import { Form, Link, useLocation } from "react-router";
import type { ReactNode } from "react";
import { Languages, Sparkles } from "lucide-react";
import { Label } from "~/components/ui/label";
import { useT } from "~/i18n";
import {
  CONTRIBUTION_COLOR,
  CONTRIBUTION_TYPES,
  type ContributionType,
  type PersonStatus,
} from "~/lib/constants";
import { cn } from "~/lib/utils";

// ---------- brand ----------

/** The NVA logo mark (the gold village symbol), from public/nva-mark.png. Decorative: pair it with text. */
export function VillageMark({ className }: { className?: string }) {
  return <img src="/nva-mark.png" alt="" aria-hidden="true" width={175} height={175} className={cn("size-8 object-contain", className)} />;
}

/**
 * The brand-kit lockup: gold mark, NEW VILLAGE ACADEMY in Montserrat Bold
 * caps, and a small line underneath (the app name, or the tagline).
 */
export function Wordmark({ className, subtitle }: { className?: string; subtitle?: string }) {
  const { t } = useT();
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <VillageMark className="size-9 shrink-0" />
      <span className="grid leading-tight">
        <span className="font-display text-[0.85rem] font-bold tracking-[0.02em] text-ink uppercase">{t("common.schoolName")}</span>
        <span className="text-xs text-smoke">{subtitle ?? t("common.appName")}</span>
      </span>
    </span>
  );
}

/** The full logo (mark, name, "High school done differently"), as NVA publishes it. */
export function FullLogo({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <img
      src="/nva-logo.webp"
      alt={`${t("common.schoolName")}: ${t("common.tagline")}`}
      width={707}
      height={294}
      className={cn("h-auto w-full max-w-[420px] object-contain", className)}
    />
  );
}

/** Hero visual for public pages: the brand logo on a soft gold field. Decorative. */
export function VillageOrbs({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative grid aspect-square w-full max-w-[420px] place-items-center", className)}>
      <div className="absolute inset-[6%] rounded-full bg-gold-soft" />
      <div className="absolute inset-[22%] rounded-full border-[10px] border-gold/25" />
      <img src="/nva-mark.png" alt="" width={175} height={175} className="relative w-[46%] object-contain" />
    </div>
  );
}

// ---------- layout ----------

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-3xl space-y-2">
        {eyebrow && <p className="text-eyebrow text-gold-ink">{eyebrow}</p>}
        <h1 className="text-heading">{title}</h1>
        {description && <p className="text-[0.95rem] leading-relaxed text-smoke">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Flat taupe panel: the default container for a section. */
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-card bg-taupe p-5 md:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-section">{title}</h2>}
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** White card with the whisper shadow, for content that sits above a panel. */
export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-card bg-canvas p-5 shadow-whisper", className)}>{children}</div>;
}

/** Dashboard number tile (the RealCRM-style stat row). */
export function StatTile({
  label,
  value,
  hint,
  icon,
  to,
  accent = "gold",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  to?: string;
  accent?: "gold" | ContributionType;
}) {
  const plate = accent === "gold" ? "bg-gold-soft text-gold-ink" : `${CONTRIBUTION_COLOR[accent].soft} ${CONTRIBUTION_COLOR[accent].ink}`;
  const body = (
    <div className="flex h-full flex-col gap-3 rounded-card border border-stone bg-canvas p-4 transition-colors hover:border-gold/60">
      <div className="flex items-center gap-2 text-sm text-graphite">
        {icon && <span className={cn("grid size-7 place-items-center rounded-full [&_svg]:size-4", plate)}>{icon}</span>}
        <span>{label}</span>
      </div>
      <div className="font-display text-3xl font-bold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-smoke">{hint}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-card focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-stone px-6 py-10 text-center">
      <VillageMark className="size-10 opacity-80" />
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-md text-sm text-smoke">{body}</p>}
      {action}
    </div>
  );
}

// ---------- CRM vocab ----------

export function ContributionChip({ type, long, className }: { type: ContributionType; long?: boolean; className?: string }) {
  const { t } = useT();
  const color = CONTRIBUTION_COLOR[type];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-stone bg-canvas px-2.5 text-xs whitespace-nowrap text-graphite",
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", color.dot)} aria-hidden="true" />
      {long ? t(`common.contributionLong.${type}`) : t(`common.contribution.${type}`)}
    </span>
  );
}

export function ContributionChips({ types, className }: { types: readonly string[]; className?: string }) {
  const known = CONTRIBUTION_TYPES.filter((type) => types.includes(type));
  if (!known.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {known.map((type) => (
        <ContributionChip key={type} type={type} />
      ))}
    </div>
  );
}

/** Skills or topics as quiet pills; matching ones get the gold tint. */
export function TagList({ tags, highlight = [], max, className }: { tags: string[]; highlight?: string[]; max?: number; className?: string }) {
  if (!tags.length) return null;
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((tag) => (
        <li
          key={tag}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs",
            highlight.includes(tag) ? "bg-gold-soft font-medium text-ink" : "bg-stone/70 text-graphite",
          )}
        >
          {tag}
        </li>
      ))}
      {max && tags.length > max && <li className="px-1 py-0.5 text-xs text-smoke">+{tags.length - max}</li>}
    </ul>
  );
}

const STATUS_STYLE: Record<PersonStatus, string> = {
  lead: "bg-purple-soft text-purple-ink",
  new: "bg-gold-soft text-gold-ink",
  active: "bg-sage-soft text-sage-ink",
  inactive: "bg-stone text-smoke",
};

export function StatusBadge({ status }: { status: PersonStatus }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium", STATUS_STYLE[status])}>
      {t(`common.status.${status}`)}
    </span>
  );
}

const AVATAR_TONES = ["bg-gold-soft text-gold-ink", "bg-rust-soft text-rust-ink", "bg-blue-soft text-blue-ink", "bg-purple-soft text-purple-ink", "bg-sage-soft text-sage-ink"];

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold", AVATAR_TONES[hash % AVATAR_TONES.length], className)}
    >
      {initials || "?"}
    </span>
  );
}

// ---------- forms ----------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium text-graphite">
        {label}
        {optional && <span className="font-normal text-smoke"> ({t("common.state.optional")})</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-smoke">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Posts to /lang and comes back to the same page in the other language. */
export function LanguageToggle({ className, variant = "pill" }: { className?: string; variant?: "pill" | "plain" }) {
  const { t, locale } = useT();
  const location = useLocation();
  return (
    <Form method="post" action="/lang" className={className}>
      <input type="hidden" name="locale" value={locale === "en" ? "es" : "en"} />
      <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
      <button
        type="submit"
        lang={locale === "en" ? "es" : "en"}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          variant === "pill" ? "h-9 rounded-full border border-stone bg-canvas px-3.5 hover:bg-taupe" : "rounded-md px-1 hover:underline",
        )}
      >
        <Languages className="size-4" aria-hidden="true" />
        {t("common.lang.switchTo")}
      </button>
    </Form>
  );
}

/** Shown where an AI feature would be, when ANTHROPIC_API_KEY isn't set. */
export function AiNotice({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <p className={cn("flex items-start gap-2 rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite", className)}>
      <Sparkles className="mt-0.5 size-4 shrink-0 text-gold-ink" aria-hidden="true" />
      {t("common.ai.notConfigured")}
    </p>
  );
}
