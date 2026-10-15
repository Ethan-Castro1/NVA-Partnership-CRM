import {
  data,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { VillageMark } from "~/components/nva";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { translate, type Locale } from "~/i18n";
import { getLocale } from "~/i18n/locale.server";
import { isAiConfigured } from "~/lib/ai/client.server";
import { getUser } from "~/lib/auth.server";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    // Brand kit: Montserrat (titles), Arimo (headings and text), Kaushan Script (accent).
    href: "https://fonts.googleapis.com/css2?family=Arimo:ital,wght@0,400..700;1,400..700&family=Kaushan+Script&family=Montserrat:wght@300;400;600;700&display=swap",
  },
  { rel: "icon", type: "image/png", href: "/favicon-64.png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  const locale = await getLocale(request, user?.locale);
  return data({ user, locale, aiConfigured: isAiConfigured() });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const root = useRouteLoaderData("root") as { locale?: Locale } | undefined;
  return (
    <html lang={root?.locale ?? "en"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const root = useRouteLoaderData("root") as { locale?: Locale } | undefined;
  const locale = root?.locale ?? "en";
  let title = translate(locale, "common.state.error");
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) title = translate(locale, "common.state.notFound");
    else if (error.status === 403) title = translate(locale, "common.state.forbidden");
  } else if (import.meta.env.DEV && error instanceof Error) {
    stack = `${error.message}\n\n${error.stack ?? ""}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-5 px-6 py-16">
      <VillageMark className="size-12" />
      <h1 className="text-heading">{title}</h1>
      <Link to="/" className="text-sm font-medium underline underline-offset-4">
        {translate(locale, "common.nav.home")}
      </Link>
      {stack && <pre className="w-full overflow-x-auto rounded-xl bg-taupe p-4 text-xs">{stack}</pre>}
    </main>
  );
}
