/**
 * The village map: everyone as a dot, every "knows" as a line, laid out on the
 * server (see layoutNetwork) so it paints without jank. Dots are coloured by
 * the first way someone helps, board and staff are ringed in gold, and leads
 * are hollow. After a search, matches and their intro paths light up and the
 * rest fades. Each dot is a link to the profile; a plain list of the
 * highlighted paths sits underneath as the text alternative.
 */
import { useId } from "react";
import { Link } from "react-router";
import { CONTRIBUTION_COLOR, CONTRIBUTION_TYPES } from "~/lib/constants";
import type { ConnectorResult, MapNode, VillageMap as VillageMapData } from "~/lib/connections.server";
import { EmptyState } from "~/components/nva";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";
import { pathText } from "./path-chain";

const GOLD = "#faad00";
const NEUTRAL = "#a59f97";
const LINK = "#d9d4cd";
const CANVAS = "#fdfcfc";

function edgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function VillageMap({
  map,
  highlight,
  results,
}: {
  map: VillageMapData;
  highlight: { matched: string[]; nodes: string[]; edges: string[] };
  results: ConnectorResult[];
}) {
  const { t } = useT();
  const captionId = useId();
  if (!map.nodes.length) return <EmptyState title={t("connections.map.empty")} />;

  const active = highlight.nodes.length > 0;
  const lit = new Set(highlight.nodes);
  const matched = new Set(highlight.matched);
  const litEdges = new Set(highlight.edges);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  // Draw highlighted people last so they sit on top.
  const ordered = active ? [...map.nodes].sort((a, b) => Number(lit.has(a.id)) - Number(lit.has(b.id))) : map.nodes;

  return (
    <figure className="grid gap-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <svg
          viewBox={`0 0 ${map.width} ${map.height}`}
          className="h-auto w-full min-w-[540px]"
          role="group"
          aria-labelledby={captionId}
        >
          <g aria-hidden="true">
            {map.links.map((link) => {
              const a = byId.get(link.source);
              const b = byId.get(link.target);
              if (!a || !b) return null;
              const on = litEdges.has(edgeKey(a.id, b.id));
              return (
                <line
                  key={`${link.source}-${link.target}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={on ? GOLD : LINK}
                  strokeWidth={on ? 3 : 1.25}
                  strokeOpacity={active && !on ? 0.35 : 1}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
          <g>
            {ordered.map((node) => (
              <MapDot key={node.id} node={node} lit={lit.has(node.id)} matched={matched.has(node.id)} faded={active && !lit.has(node.id)} />
            ))}
          </g>
        </svg>
      </div>

      <figcaption className="grid gap-3">
        <span id={captionId} className="sr-only">
          {t("connections.map.figureLabel", { people: map.nodes.length, links: map.links.length })}
        </span>
        <MapLegend shown={new Set(map.nodes.flatMap((n) => (n.contribution ? [n.contribution] : [])))} />
        <HighlightList active={active} results={results} />
      </figcaption>
    </figure>
  );
}

function MapDot({ node, lit, matched, faded }: { node: MapNode; lit: boolean; matched: boolean; faded: boolean }) {
  const r = matched ? 9 : node.inner ? 7.5 : 6.5;
  const fill = node.color ?? NEUTRAL;
  const label = node.subtitle ? `${node.name}, ${node.subtitle}` : node.name;
  const labelY = node.y - r - (node.inner ? 9 : 7);
  return (
    <Link to={`/app/people/${node.id}`} aria-label={label} className="group outline-none" style={{ opacity: faded ? 0.28 : 1 }}>
      <title>{label}</title>
      {/* Bigger invisible target so small dots are easy to hit. */}
      <circle cx={node.x} cy={node.y} r={r + 8} fill="transparent" />
      <circle
        cx={node.x}
        cy={node.y}
        r={r + 7}
        fill="none"
        stroke="#000"
        strokeWidth={2}
        className="opacity-0 group-focus-visible:opacity-100"
      />
      {node.inner && <circle cx={node.x} cy={node.y} r={r + 3.5} fill="none" stroke={GOLD} strokeWidth={2.5} />}
      <circle
        cx={node.x}
        cy={node.y}
        r={r}
        fill={node.lead ? CANVAS : fill}
        stroke={node.lead ? fill : CANVAS}
        strokeWidth={node.lead ? 2.25 : 1.5}
      />
      <text
        x={node.x}
        y={labelY}
        textAnchor="middle"
        className={cn(
          "pointer-events-none fill-ink font-sans text-[13px] [paint-order:stroke] stroke-canvas [stroke-width:4px] [stroke-linejoin:round]",
          lit ? "font-bold" : "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {node.name}
      </text>
    </Link>
  );
}

/** Colors for the ways to help that appear on this map (so staff never see a funder swatch). */
function MapLegend({ shown }: { shown: ReadonlySet<string> }) {
  const { t } = useT();
  const swatch = (children: React.ReactNode) => (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0" aria-hidden="true">
      {children}
    </svg>
  );
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-graphite">
      {CONTRIBUTION_TYPES.filter((type) => shown.has(type)).map((type) => (
        <li key={type} className="flex items-center gap-1.5">
          {swatch(<circle cx="10" cy="10" r="6" fill={CONTRIBUTION_COLOR[type].hex} />)}
          {t(`common.contribution.${type}`)}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        {swatch(<circle cx="10" cy="10" r="5" fill={NEUTRAL} />)}
        {t("connections.map.legendNone")}
      </li>
      <li className="flex items-center gap-1.5">
        {swatch(
          <>
            <circle cx="10" cy="10" r="7.5" fill="none" stroke={GOLD} strokeWidth="2.5" />
            <circle cx="10" cy="10" r="4" fill={NEUTRAL} />
          </>,
        )}
        {t("connections.map.legendInner")}
      </li>
      <li className="flex items-center gap-1.5">
        {swatch(<circle cx="10" cy="10" r="5.5" fill={CANVAS} stroke={NEUTRAL} strokeWidth="2" />)}
        {t("connections.map.legendLead")}
      </li>
    </ul>
  );
}

function HighlightList({ active, results }: { active: boolean; results: ConnectorResult[] }) {
  const { t } = useT();
  if (!active) return <p className="text-sm text-smoke">{t("connections.map.highlightHint")}</p>;
  const lines = results.flatMap((result) => {
    if (result.direct) return [`${result.person.full_name}: ${t("connections.results.askDirectly")}`];
    if (!result.paths.length) return [`${result.person.full_name}: ${t("connections.results.noPath")}`];
    return result.paths.map((path) => pathText(path, t));
  });
  return (
    <div className="rounded-xl border border-stone bg-canvas p-3.5">
      <h3 className="text-eyebrow text-smoke">{t("connections.map.highlightTitle")}</h3>
      <ul className="mt-2 grid gap-1 text-sm text-graphite">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
