import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

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

  // Staff app: signed-in teachers and admins (the layout checks).
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
      route("new", "routes/app.people.new.tsx"),
      route(":personId", "routes/app.people.$personId.tsx"),
      route(":personId/edit", "routes/app.people.$personId.edit.tsx"),
    ]),
    route("connections", "routes/app.connections.tsx"),
    ...prefix("caps", [
      index("routes/app.caps._index.tsx"),
      route("new", "routes/app.caps.new.tsx"),
      route(":capId", "routes/app.caps.$capId.tsx"),
    ]),
    route("account", "routes/app.account.tsx"),
    route("connect", "routes/app.connect.tsx"),

    // Admin only (each loader/action calls requireAdmin).
    ...prefix("admin", [
      index("routes/app.admin._index.tsx"),
      route("intake", "routes/app.admin.intake._index.tsx"),
      route("intake/:submissionId", "routes/app.admin.intake.$submissionId.tsx"),
      route("users", "routes/app.admin.users.tsx"),
      route("export.csv", "routes/app.admin.export.ts"),
    ]),
  ]),
] satisfies RouteConfig;
