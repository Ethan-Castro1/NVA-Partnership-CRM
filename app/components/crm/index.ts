/**
 * CRM pieces (opportunities and follow-ups, admin only) for other screens to drop in:
 *
 *   // In an admin-only loader:
 *   const crm = await getPersonCrm(user, personId);         // ~/lib/follow-ups.server
 *   // In the page (admins only):
 *   <OpportunitiesPanel personId={id} opportunities={crm.opportunities} today={crm.today} />
 *   <FollowUpsPanel personId={id} followUps={crm.followUps} today={crm.today}
 *                   opportunities={crm.opportunities} owners={crm.owners} />
 *
 *   // Dashboard: listFollowUps(user, { views: ["overdue", "today"] }) and schoolToday()
 *   <FollowUpList items={items} today={today} />
 *   <QuickFollowUpForm today={today} people={options.people} owners={options.owners} />  // getCrmFormOptions(user)
 *
 * Every action posts to /app/follow-ups/action, which checks the admin role.
 * See each file's header for the full props.
 */
export { FollowUpList, FOLLOW_UP_ACTION, type FollowUpListProps, type FollowUpActionResult } from "./follow-up-list";
export { FollowUpsPanel, type FollowUpsPanelProps } from "./follow-ups-panel";
export { OpportunitiesPanel, OpportunityRows, type OpportunitiesPanelProps } from "./opportunities-panel";
export { QuickFollowUpForm, type QuickFollowUpFormProps } from "./quick-follow-up-form";
export { StageBadge, SegmentedLinks, CrmSelect, crmDate } from "./crm-bits";
