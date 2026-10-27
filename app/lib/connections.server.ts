/**
 * The connection finder's server side: ordering need-search results, working
 * out which map nodes and edges to highlight, and laying out the village map.
 *
 * The layout is computed here (not in the browser) so the SVG arrives ready to
 * paint with no layout jank, and it is deterministic: the same people and
 * links always land in the same places, so the map doesn't jump between visits.
 */
import { CONTRIBUTION_COLOR, CONTRIBUTION_TYPES, INNER_CIRCLE, type ContributionType, type RelationshipKind, type Role } from "./constants";
import { getNetwork, type IntroPath, type MiniPerson, type SearchHit } from "./people.server";
import type { Viewer } from "./permissions.server";

// ---------- need search ----------

export type ConnectorResult = { person: SearchHit; direct: boolean; paths: IntroPath[] };

/** 0 = ask directly (board/staff), 1 or 2 = closest intro path, 3 = no known path. */
export function closeness(result: Pick<ConnectorResult, "direct" | "paths">): number {
  if (result.direct) return 0;
  if (!result.paths.length) return 3;
  return Math.min(...result.paths.map((path) => path.degree));
}

/** People we can reach first (closest first), then the rest; search rank breaks ties. */
export function sortConnectorResults<T extends Pick<ConnectorResult, "direct" | "paths">>(results: T[]): T[] {
  return results
    .map((result, index) => ({ result, index, rank: closeness(result) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ result }) => result);
}

/** Undirected edge id, so a→b and b→a highlight the same line. */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The people matched by a search plus everyone and every link on their intro paths. */
export function highlightFor(results: Pick<ConnectorResult, "person" | "paths">[]): {
  matched: string[];
  nodes: string[];
  edges: string[];
} {
  const matched = new Set<string>();
  const nodes = new Set<string>();
  const edges = new Set<string>();
  for (const { person, paths } of results) {
    matched.add(person.id);
    nodes.add(person.id);
    for (const path of paths) {
      path.chain.forEach((p, i) => {
        nodes.add(p.id);
        if (i > 0) edges.add(edgeKey(path.chain[i - 1].id, p.id));
      });
    }
  }
  return { matched: [...matched], nodes: [...nodes], edges: [...edges] };
}

// ---------- layout ----------

export type LayoutOptions = {
  width?: number;
  height?: number;
  padding?: number;
  iterations?: number;
  seed?: number;
};

export type LayoutInputNode = { id: string; inner?: boolean };
export type LayoutInputLink = { source: string; target: string };
export type Point = { id: string; x: number; y: number };

/** Small seeded PRNG (mulberry32): deterministic jitter without Math.random. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Force-directed layout (Fruchterman-Reingold) with a seeded start: board and
 * staff begin on an inner ring and are pulled harder to the centre, everyone
 * else starts on an outer ring. Links pull people together, everyone pushes
 * everyone apart, and gravity keeps loners from drifting off. The result is
 * scaled to fit inside the viewBox with `padding` to spare on every side.
 */
export function layoutNetwork(
  nodes: LayoutInputNode[],
  links: LayoutInputLink[],
  options: LayoutOptions = {},
): { width: number; height: number; points: Point[]; links: LayoutInputLink[] } {
  const width = options.width ?? 720;
  const height = options.height ?? 460;
  const padding = options.padding ?? 40;
  const iterations = options.iterations ?? 300;
  const random = seededRandom(options.seed ?? 20260);

  // Sort by id so the input order (e.g. "recently updated first") can't move anyone.
  const sorted = [...new Map(nodes.map((n) => [n.id, n])).values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const index = new Map(sorted.map((n, i) => [n.id, i]));
  const seen = new Set<string>();
  const validLinks = links.filter((l) => {
    if (l.source === l.target || !index.has(l.source) || !index.has(l.target)) return false;
    const key = edgeKey(l.source, l.target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const n = sorted.length;
  if (n === 0) return { width, height, points: [], links: [] };
  const cx = width / 2;
  const cy = height / 2;
  if (n === 1) return { width, height, points: [{ id: sorted[0].id, x: cx, y: cy }], links: [] };

  const pairs = validLinks.map((l) => [index.get(l.source)!, index.get(l.target)!] as const);
  const inner = sorted.map((node) => !!node.inner);
  const innerCount = inner.filter(Boolean).length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const short = Math.min(width, height);
  let innerSeen = 0;
  let outerSeen = 0;
  for (let i = 0; i < n; i++) {
    const ring = inner[i] ? short * 0.12 : short * 0.36;
    const slot = inner[i] ? innerSeen++ / Math.max(innerCount, 1) : outerSeen++ / Math.max(n - innerCount, 1);
    const angle = slot * Math.PI * 2 + random() * 0.4;
    x[i] = cx + Math.cos(angle) * ring + (random() - 0.5) * 10;
    y[i] = cy + Math.sin(angle) * ring + (random() - 0.5) * 10;
  }

  const k = Math.sqrt((width * height) / n) * 0.6;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temperature = width / 8;
  const cooling = temperature / (iterations + 1);

  for (let iter = 0; iter < iterations; iter++) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = x[i] - x[j];
        let ddy = y[i] - y[j];
        let dist = Math.hypot(ddx, ddy);
        if (dist < 0.01) {
          ddx = random() - 0.5;
          ddy = random() - 0.5;
          dist = Math.hypot(ddx, ddy) || 0.01;
        }
        const force = (k * k) / dist;
        const fx = (ddx / dist) * force;
        const fy = (ddy / dist) * force;
        dx[i] += fx;
        dy[i] += fy;
        dx[j] -= fx;
        dy[j] -= fy;
      }
    }
    for (const [a, b] of pairs) {
      const ddx = x[a] - x[b];
      const ddy = y[a] - y[b];
      const dist = Math.max(Math.hypot(ddx, ddy), 0.01);
      const force = (dist * dist) / k;
      const fx = (ddx / dist) * force;
      const fy = (ddy / dist) * force;
      dx[a] -= fx;
      dy[a] -= fy;
      dx[b] += fx;
      dy[b] += fy;
    }
    for (let i = 0; i < n; i++) {
      const gravity = inner[i] ? 0.6 : 0.25;
      dx[i] -= (x[i] - cx) * gravity;
      dy[i] -= (y[i] - cy) * gravity;
      const len = Math.hypot(dx[i], dy[i]);
      if (len > 0) {
        const step = Math.min(len, temperature);
        x[i] += (dx[i] / len) * step;
        y[i] += (dy[i] / len) * step;
      }
    }
    temperature = Math.max(temperature - cooling, 0.5);
  }

  // Fit the drawing inside the padded viewBox.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minY = Math.min(minY, y[i]);
    maxY = Math.max(maxY, y[i]);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  // Stretch to use the box, but never more than 1.5x in one direction, so link lengths stay honest.
  const fitX = (width - padding * 2) / spanX;
  const fitY = (height - padding * 2) / spanY;
  const scaleX = Math.min(fitX, fitY * 1.5);
  const scaleY = Math.min(fitY, fitX * 1.5);
  const offsetX = (width - spanX * scaleX) / 2;
  const offsetY = (height - spanY * scaleY) / 2;
  const round = (v: number) => Math.round(v * 10) / 10;
  const points = sorted.map((node, i) => ({
    id: node.id,
    x: round(offsetX + (x[i] - minX) * scaleX),
    y: round(offsetY + (y[i] - minY) * scaleY),
  }));
  return { width, height, points, links: validLinks };
}

// ---------- the village map ----------

export type MapNode = {
  id: string;
  name: string;
  subtitle: string | null;
  x: number;
  y: number;
  /** Board or staff: ringed in gold. */
  inner: boolean;
  /** Not contacted yet: drawn hollow. */
  lead: boolean;
  /** Hex for the first way they help, or null when none is listed. */
  color: string | null;
  contribution: ContributionType | null;
};
export type MapLink = { source: string; target: string; kind: RelationshipKind };
export type VillageMap = { width: number; height: number; nodes: MapNode[]; links: MapLink[] };

const isInner = (p: Pick<MiniPerson, "affiliations">) => p.affiliations.some((a) => INNER_CIRCLE.includes(a));

// The layout only changes when people or links change, so keep the last one
// per role (staff see only the staff directory, so their map is different).
const cached = new Map<Role, { key: string; map: VillageMap }>();

/** The village map as this viewer may see it (staff: only people in the staff directory). */
export async function getVillageMap(viewer: Viewer): Promise<VillageMap> {
  const network = await getNetwork(viewer);
  const key = JSON.stringify([
    network.nodes.map((n) => [n.id, n.full_name, n.status, n.affiliations, n.contribution_types, n.title, n.organization_name]),
    network.links.map((l) => [l.source, l.target, l.kind]),
  ]);
  const hit = cached.get(viewer.role);
  if (hit?.key === key) return hit.map;

  const layout = layoutNetwork(
    network.nodes.map((n) => ({ id: n.id, inner: isInner(n) })),
    network.links,
  );
  const byId = new Map(network.nodes.map((n) => [n.id, n]));
  const kinds = new Map(network.links.map((l) => [edgeKey(l.source, l.target), l.kind]));
  const map: VillageMap = {
    width: layout.width,
    height: layout.height,
    nodes: layout.points.map((point) => {
      const person = byId.get(point.id)!;
      const contribution = CONTRIBUTION_TYPES.find((type) => person.contribution_types.includes(type)) ?? null;
      return {
        id: point.id,
        name: person.full_name,
        subtitle: [person.title, person.organization_name].filter(Boolean).join(", ") || null,
        x: point.x,
        y: point.y,
        inner: isInner(person),
        lead: person.status === "lead",
        color: contribution ? CONTRIBUTION_COLOR[contribution].hex : null,
        contribution,
      };
    }),
    links: layout.links.map((l) => ({ source: l.source, target: l.target, kind: kinds.get(edgeKey(l.source, l.target)) ?? "knows" })),
  };
  cached.set(viewer.role, { key, map });
  return map;
}
