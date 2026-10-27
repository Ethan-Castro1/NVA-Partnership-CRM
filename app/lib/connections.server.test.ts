import { describe, expect, it } from "vitest";
import { addRelationship, createPerson } from "./people.server";
import {
  closeness,
  edgeKey,
  getVillageMap,
  highlightFor,
  layoutNetwork,
  sortConnectorResults,
  type ConnectorResult,
} from "./connections.server";

const ADMIN = { id: "test-admin", role: "admin" } as const;

function network(n: number, linkEvery = 3) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(3, "0")}`, inner: i < 3 }));
  const links = nodes.slice(1).flatMap((node, i) => (i % linkEvery === 0 ? [{ source: nodes[i].id, target: node.id }] : []));
  return { nodes, links };
}

describe("layoutNetwork", () => {
  it("is deterministic, whatever order the nodes arrive in", () => {
    const { nodes, links } = network(30);
    const a = layoutNetwork(nodes, links);
    const b = layoutNetwork([...nodes].reverse(), [...links].reverse());
    const pos = (r: typeof a) => Object.fromEntries(r.points.map((p) => [p.id, [p.x, p.y]]));
    expect(pos(a)).toEqual(pos(b));
  });

  it("keeps every node inside the padded viewBox", () => {
    const { nodes, links } = network(60, 2);
    const { width, height, points } = layoutNetwork(nodes, links, { width: 640, height: 440, padding: 30 });
    expect(points).toHaveLength(60);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(30 - 0.1);
      expect(p.x).toBeLessThanOrEqual(width - 30 + 0.1);
      expect(p.y).toBeGreaterThanOrEqual(30 - 0.1);
      expect(p.y).toBeLessThanOrEqual(height - 30 + 0.1);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("drops links to unknown nodes, self-links and duplicates", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { links } = layoutNetwork(nodes, [
      { source: "a", target: "b" },
      { source: "b", target: "a" },
      { source: "a", target: "a" },
      { source: "a", target: "zzz" },
      { source: "b", target: "c" },
    ]);
    expect(links).toEqual([
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ]);
  });

  it("handles empty and single-node networks", () => {
    expect(layoutNetwork([], []).points).toEqual([]);
    expect(layoutNetwork([{ id: "solo" }], [], { width: 100, height: 80 }).points).toEqual([{ id: "solo", x: 50, y: 40 }]);
  });

  it("places linked people closer than unlinked ones on average", () => {
    const { nodes, links } = network(40, 1);
    const { points } = layoutNetwork(nodes, links);
    const at = new Map(points.map((p) => [p.id, p]));
    const dist = (a: string, b: string) => Math.hypot(at.get(a)!.x - at.get(b)!.x, at.get(a)!.y - at.get(b)!.y);
    const linked = links.map((l) => dist(l.source, l.target));
    const all = points.flatMap((a, i) => points.slice(i + 1).map((b) => dist(a.id, b.id)));
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(linked)).toBeLessThan(mean(all));
  });
});

const person = (id: string) =>
  ({ id, full_name: id, affiliations: [], status: "active" }) as unknown as ConnectorResult["person"];
const mini = (id: string) => ({ id, full_name: id, title: null, organization_name: null, affiliations: [], status: "active" as const });

describe("need search ordering and highlights", () => {
  const none: ConnectorResult = { person: person("none"), direct: false, paths: [] };
  const two: ConnectorResult = {
    person: person("two"),
    direct: false,
    paths: [{ degree: 2, chain: [mini("board"), mini("mid"), mini("two")], edges: [{ kind: "knows", note: null }, { kind: "colleague", note: null }] }],
  };
  const one: ConnectorResult = {
    person: person("one"),
    direct: false,
    paths: [{ degree: 1, chain: [mini("board"), mini("one")], edges: [{ kind: "knows", note: null }] }],
  };
  const direct: ConnectorResult = { person: person("direct"), direct: true, paths: [] };

  it("puts reachable people first, closest first, keeping search rank for ties", () => {
    expect(closeness(direct)).toBe(0);
    expect(closeness(none)).toBe(3);
    expect(sortConnectorResults([none, two, one, direct]).map((r) => r.person.id)).toEqual(["direct", "one", "two", "none"]);
  });

  it("highlights matches, the people on their paths and the links between them", () => {
    const h = highlightFor([two, none]);
    expect(h.matched.sort()).toEqual(["none", "two"]);
    expect(h.nodes.sort()).toEqual(["board", "mid", "none", "two"]);
    expect(h.edges.sort()).toEqual([edgeKey("board", "mid"), edgeKey("mid", "two")].sort());
    expect(edgeKey("b", "a")).toBe(edgeKey("a", "b"));
  });
});

describe("getVillageMap", () => {
  it("lays out real people with colours, inner-circle rings and hollow leads", async () => {
    const board = await createPerson({ full_name: "Rita Board", affiliations: ["board"] }, null);
    const lead = await createPerson({ full_name: "Lee Lead", status: "lead", contribution_types: ["internship", "skills_lesson"] }, null);
    await createPerson({ full_name: "Gone Person", status: "inactive" }, null);
    await addRelationship({ personId: board, relatedPersonId: lead, kind: "knows" }, null);

    const map = await getVillageMap(ADMIN);
    expect(map.nodes).toHaveLength(2);
    const byId = new Map(map.nodes.map((n) => [n.id, n]));
    expect(byId.get(board)).toMatchObject({ inner: true, lead: false, color: null });
    // First way to help in CONTRIBUTION_TYPES order, not the order stored.
    expect(byId.get(lead)).toMatchObject({ inner: false, lead: true, contribution: "skills_lesson", color: "#cf6608" });
    expect(map.links).toEqual([{ source: board, target: lead, kind: "knows" }]);
    expect(await getVillageMap(ADMIN)).toBe(map);
  });
});
