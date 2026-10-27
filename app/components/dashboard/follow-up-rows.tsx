/**
 * The dashboard's follow-ups: the shared FollowUpList, grouped into due now,
 * coming up and waiting on a reply (headings only when more than one group has
 * rows). On phones only the first three rows show in all; "View all" has the rest.
 */
import { FollowUpList } from "~/components/crm";
import type { FollowUpItem } from "~/lib/follow-ups.server";
import { cn } from "~/lib/utils";

export type FollowUpGroup = { key: string; label: string; items: FollowUpItem[] };

const MOBILE_ROWS = 3;
// Literal classes (Tailwind only sees whole strings): on phones, keep the first n rows of a group.
const KEEP_ON_PHONE: Record<number, string> = {
  1: "max-sm:[&>li:nth-child(n+2)]:hidden",
  2: "max-sm:[&>li:nth-child(n+3)]:hidden",
  3: "max-sm:[&>li:nth-child(n+4)]:hidden",
};

export function DashboardFollowUps({ groups, today, empty }: { groups: FollowUpGroup[]; today: string; empty: string }) {
  const shown = groups.filter((g) => g.items.length > 0);
  if (!shown.length) return <p className="py-2 text-sm text-smoke">{empty}</p>;
  let start = 0;
  return (
    <div className="grid min-w-0 gap-4">
      {shown.map((group) => {
        const room = MOBILE_ROWS - start;
        start += group.items.length;
        return (
          <section key={group.key} className={cn("min-w-0", room <= 0 && "max-sm:hidden")}>
            {shown.length > 1 && <h3 className="text-eyebrow text-smoke">{group.label}</h3>}
            <FollowUpList items={group.items} today={today} showOpportunity={false} className={cn("-mt-1", KEEP_ON_PHONE[room])} />
          </section>
        );
      })}
    </div>
  );
}
