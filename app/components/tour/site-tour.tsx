/**
 * A guided tour of the app: one for staff (Search, Connect, Arrange) and one
 * for administrators (the CRM). Each step opens its page, dims everything but
 * the part it is about, and explains it in a small card. It opens by itself
 * the first time someone reaches the dashboard in a browser, and "Take the
 * tour" in the name menu replays it. Pages mark what a step points at with
 * data-tour; a step whose target isn't on screen shows its card in the middle.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { X } from "lucide-react";
import { VillageMark } from "~/components/nva";
import { useAssistant } from "~/components/assistant/assistant-provider";
import { Button } from "~/components/ui/button";
import { useSidebar } from "~/components/ui/sidebar";
import { useT, type MessageKey } from "~/i18n";
import type { Role } from "~/lib/constants";
import { cn } from "~/lib/utils";

type Step = {
  /** The page the step is on (a path, optionally with a query). */
  path: string;
  /** What to highlight: a CSS selector; the first visible match wins. */
  target?: string;
  title: MessageKey;
  body: MessageKey;
};

const PAGE = "[data-tour=page]";
const ASK_BOX = "form:has(#ask-page)";

const STAFF_STEPS: Step[] = [
  { path: "/app", title: "tour.welcome.title", body: "tour.staff.welcome.body" },
  { path: "/app", target: "[data-tour=need-search]", title: "tour.staff.search.title", body: "tour.staff.search.body" },
  { path: "/app/ask", target: ASK_BOX, title: "tour.staff.ask.title", body: "tour.staff.ask.body" },
  {
    path: "/app/people",
    target: "section[aria-labelledby=people-results] li",
    title: "tour.staff.connect.title",
    body: "tour.staff.connect.body",
  },
  { path: "/app/requests", target: PAGE, title: "tour.staff.arrange.title", body: "tour.staff.arrange.body" },
  { path: "/app/caps", target: PAGE, title: "tour.staff.caps.title", body: "tour.staff.caps.body" },
  { path: "/app/my-connections", target: PAGE, title: "tour.staff.connections.title", body: "tour.staff.connections.body" },
  { path: "/app", title: "tour.staff.done.title", body: "tour.done.body" },
];

const ADMIN_STEPS: Step[] = [
  { path: "/app", title: "tour.welcome.title", body: "tour.admin.welcome.body" },
  { path: "/app", target: "[data-tour=follow-ups]", title: "tour.admin.followUps.title", body: "tour.admin.followUps.body" },
  { path: "/app", target: "[data-tour=quick-actions]", title: "tour.admin.quick.title", body: "tour.admin.quick.body" },
  { path: "/app/people", target: PAGE, title: "tour.admin.people.title", body: "tour.admin.people.body" },
  { path: "/app/opportunities", target: PAGE, title: "tour.admin.opportunities.title", body: "tour.admin.opportunities.body" },
  { path: "/app/follow-ups", target: PAGE, title: "tour.admin.followUpsPage.title", body: "tour.admin.followUpsPage.body" },
  { path: "/app/admin/requests", target: PAGE, title: "tour.admin.requests.title", body: "tour.admin.requests.body" },
  { path: "/app/communications", target: PAGE, title: "tour.admin.comms.title", body: "tour.admin.comms.body" },
  { path: "/app/admin/intake", target: PAGE, title: "tour.admin.signups.title", body: "tour.admin.signups.body" },
  { path: "/app/admin/settings", target: PAGE, title: "tour.admin.settings.title", body: "tour.admin.settings.body" },
  { path: "/app/ask", target: ASK_BOX, title: "tour.admin.ask.title", body: "tour.admin.ask.body" },
  { path: "/app", title: "tour.admin.done.title", body: "tour.done.body" },
];

const TourContext = createContext<{ start: () => void } | null>(null);

export function useTour() {
  const value = useContext(TourContext);
  if (!value) throw new Error("useTour must be used inside TourProvider");
  return value;
}

/** Whether this browser has seen the tour, per account. A convenience only: if storage is blocked it just won't open by itself. */
function seenKey(userId: string) {
  return `nva.tour.${userId}`;
}

export function TourProvider({ role, userId, children }: { role: Role; userId: string; children: ReactNode }) {
  const steps = role === "admin" ? ADMIN_STEPS : STAFF_STEPS;
  const [index, setIndex] = useState<number | null>(null);
  const { setPanelOpen } = useAssistant();
  const { setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();

  const start = useCallback(() => {
    setPanelOpen(false);
    setOpenMobile(false);
    setIndex(0);
  }, [setPanelOpen, setOpenMobile]);

  const finish = useCallback(() => {
    setIndex(null);
    try {
      window.localStorage.setItem(seenKey(userId), "done");
    } catch {
      // Not remembered; it may open again next time.
    }
  }, [userId]);

  // The first visit to the dashboard opens the tour (once per page load at most).
  const offered = useRef(false);
  useEffect(() => {
    if (location.pathname !== "/app" || offered.current) return;
    offered.current = true;
    try {
      if (!window.localStorage.getItem(seenKey(userId))) start();
    } catch {
      // Storage blocked: don't open it by itself.
    }
  }, [location.pathname, userId, start]);

  // Each step opens its page.
  const step = index === null ? null : steps[index];
  useEffect(() => {
    if (!step) return;
    const [pathname, search = ""] = step.path.split("?");
    if (location.pathname !== pathname || (search && location.search !== `?${search}`)) {
      navigate(step.path, { preventScrollReset: false });
    }
  }, [step, location.pathname, location.search, navigate]);

  const value = useMemo(() => ({ start }), [start]);
  return (
    <TourContext.Provider value={value}>
      {children}
      {step && index !== null && (
        <TourStep
          key={index}
          step={step}
          n={index + 1}
          total={steps.length}
          onPage={location.pathname === step.path.split("?")[0]}
          onBack={() => setIndex(Math.max(0, index - 1))}
          onNext={() => (index + 1 < steps.length ? setIndex(index + 1) : finish())}
          onClose={finish}
        />
      )}
    </TourContext.Provider>
  );
}

function visible(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

/** Finds the step's target once its page has rendered (waiting up to 3 seconds), scrolls it into view and follows it. */
function useTarget(selector: string | undefined, onPage: boolean): { rect: DOMRect | null; ready: boolean } {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRect(null);
    setReady(false);
    if (!onPage) return;
    if (!selector) {
      setReady(true);
      return;
    }
    let el: Element | undefined;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => el && setRect(el.getBoundingClientRect()));
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const find = () => {
      el = [...document.querySelectorAll(selector)].find(visible);
      if (el) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const behavior = reduce ? "auto" : "smooth";
        if (window.innerWidth < 640) {
          // Phones: the card sits at the bottom, so bring the target's top up under the top bar.
          window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior });
        } else {
          el.scrollIntoView({ block: "center", behavior });
        }
        observer?.observe(el);
        measure();
        // Let a smooth scroll settle before showing the card.
        timer = setTimeout(() => {
          measure();
          setReady(true);
        }, reduce ? 0 : 350);
      } else if (tries++ < 30) {
        timer = setTimeout(find, 100);
      } else {
        setReady(true);
      }
    };
    find();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector, onPage]);

  return { rect, ready };
}

const GAP = 12;
const GUTTER = 16;

function TourStep({
  step,
  n,
  total,
  onPage,
  onBack,
  onNext,
  onClose,
}: {
  step: Step;
  n: number;
  total: number;
  onPage: boolean;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const { rect, ready } = useTarget(step.target, onPage);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Transparent (not visibility: hidden, which the buttons' transitions carry over and which blocks focus) until placed.
  const [cardStyle, setCardStyle] = useState<CSSProperties>({ opacity: 0 });
  const first = n === 1;
  const last = n === total;

  // Place the card under the highlighted part, else above it, else in the corner; centered with nothing to point at.
  // On phones it sits at the bottom of the screen.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !ready) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    if (!rect) {
      setCardStyle({ left: Math.max(GUTTER, (vw - w) / 2), top: Math.max(GUTTER, (vh - h) / 2) });
    } else if (vw < 640) {
      setCardStyle({ left: GUTTER, right: GUTTER, bottom: GUTTER });
    } else {
      const left = Math.min(Math.max(rect.left, GUTTER), vw - w - GUTTER);
      if (rect.bottom + GAP + h <= vh - GUTTER) setCardStyle({ left, top: rect.bottom + GAP });
      else if (rect.top - GAP - h >= GUTTER) setCardStyle({ left, top: rect.top - GAP - h });
      else setCardStyle({ right: GUTTER, bottom: GUTTER });
    }
  }, [rect, ready]);

  // Focus the main button once the card is placed.
  const placed = ready && cardStyle.opacity !== 0;
  useEffect(() => {
    if (placed) primaryRef.current?.focus({ preventScroll: true });
  }, [placed]);

  // Keys work wherever focus is: Escape closes, the arrows move, and Tab stays in the card.
  const keys = useRef({ onBack, onNext, onClose, first });
  keys.current = { onBack, onNext, onClose, first };
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const { onBack, onNext, onClose, first } = keys.current;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (event.key === "ArrowLeft" && !first) {
        event.preventDefault();
        onBack();
      } else if (event.key === "Tab") {
        const items = [...(cardRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
        if (!items.length) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === -1 || at === items.length - 1 ? 0 : at + 1;
        event.preventDefault();
        items[next].focus();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const pad = 6;
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {/* Blocks the page while the tour is open; the highlighted part stays visible but can't be clicked. */}
      <div className={cn("absolute inset-0", !rect && "bg-ink/45")} aria-hidden="true" />
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-2 ring-gold shadow-[0_0_0_9999px_rgb(20_17_12/0.45)] motion-safe:transition-all motion-safe:duration-200"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      {ready && (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          style={cardStyle}
          className="absolute grid w-[min(24rem,calc(100vw-2rem))] gap-3 rounded-2xl bg-canvas p-5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] max-sm:w-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
        >
          <div className="flex items-start gap-3">
            {first && <VillageMark className="mt-0.5 size-8 shrink-0" />}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-medium text-smoke">
                <span className="sr-only">{t("tour.label")}: </span>
                {t("tour.step", { n, total })}
              </p>
              <h2 id="tour-title" className="font-display text-lg leading-snug font-bold tracking-tight">
                {t(step.title)}
              </h2>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("tour.close")} className="-mt-1 -mr-2 text-smoke">
              <X aria-hidden="true" />
            </Button>
          </div>
          <p id="tour-body" className="text-sm leading-relaxed text-graphite">
            {t(step.body)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={cn("size-1.5 rounded-full", i < n ? "bg-gold" : "bg-stone")} />
              ))}
            </span>
            <span className="flex-1" />
            {first ? (
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {t("tour.later")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={onBack}>
                {t("tour.back")}
              </Button>
            )}
            <Button ref={primaryRef} type="button" variant="brand" size="sm" onClick={onNext}>
              {first ? t("tour.start") : last ? t("tour.done") : t("tour.next")}
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
