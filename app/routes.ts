import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

/**
 * Every route in the app (docs/build-contract.md section 7). Each loader and
 * action checks the role itself; this map only says where things live.
 */
export default [
  // Public: anyone can see these.
  index("routes/index.ts"),
  route("home", "routes/home.tsx"),
  route("mcp/:key", "routes/mcp.$key.ts"),
  route("join", "routes/join.tsx"),
  route("join/thanks", "routes/join.thanks.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  route("lang", "routes/lang.ts"),
  route("healthcheck", "routes/healthcheck.ts"),

  // The app: signed-in staff and admins (the layout checks sign-in; pages check the role).
  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("ask", "routes/app.ask.tsx"),
    ...prefix("assistant", [
      route("chat", "routes/app.assistant.chat.ts"),
      route("chats", "routes/app.assistant.chats.ts"),
      route("chats/:chatId", "routes/app.assistant.chats.$chatId.ts"),
    ]),
    ...prefix("people", [
      index("routes/app.people._index.tsx"),
      // Admin only: quick add, edit, email.
      route("new", "routes/app.people.new.tsx"),
      route(":personId", "routes/app.people.$personId.tsx"),
      route(":personId/edit", "routes/app.people.$personId.edit.tsx"),
      route(":personId/email", "routes/app.people.$personId.email.tsx"),
    ]),
    // Staff use it too, scoped to the staff directory.
    route("connections", "routes/app.connections.tsx"),
    ...prefix("caps", [
      index("routes/app.caps._index.tsx"),
      route("new", "routes/app.caps.new.tsx"),
      route(":capId", "routes/app.caps.$capId.tsx"),
    ]),
    // Staff requests: staff see their own, admins see all.
    ...prefix("requests", [
      index("routes/app.requests._index.tsx"),
      route("new", "routes/app.requests.new.tsx"),
      route(":requestId", "routes/app.requests.$requestId.tsx"),
    ]),
    route("my-connections", "routes/app.my-connections.tsx"),
    route("saved", "routes/app.saved.ts"),
    route("account", "routes/app.account.tsx"),
    route("connect", "routes/app.connect.tsx"),

    // Admin only (each loader/action calls requireAdmin).
    ...prefix("organizations", [
      index("routes/app.organizations._index.tsx"),
      route(":orgId", "routes/app.organizations.$orgId.tsx"),
    ]),
    ...prefix("opportunities", [
      index("routes/app.opportunities._index.tsx"),
      route("new", "routes/app.opportunities.new.tsx"),
      route(":opportunityId", "routes/app.opportunities.$opportunityId.tsx"),
    ]),
    ...prefix("follow-ups", [
      index("routes/app.follow-ups._index.tsx"),
      route("action", "routes/app.follow-ups.action.ts"),
    ]),
    route("communications", "routes/app.communications.tsx"),
    ...prefix("admin", [
      index("routes/app.admin._index.tsx"),
      route("requests", "routes/app.admin.requests.tsx"),
      route("intake", "routes/app.admin.intake._index.tsx"),
      route("intake/:submissionId", "routes/app.admin.intake.$submissionId.tsx"),
      route("settings", "routes/app.admin.settings._index.tsx"),
      route("settings/email", "routes/app.admin.settings.email.tsx"),
      route("email/connect/:provider", "routes/app.admin.email.connect.$provider.ts"),
      route("email/callback", "routes/app.admin.email.callback.ts"),
      route("users", "routes/app.admin.users.tsx"),
      route("export.csv", "routes/app.admin.export.ts"),
    ]),
  ]),
] satisfies RouteConfig;
