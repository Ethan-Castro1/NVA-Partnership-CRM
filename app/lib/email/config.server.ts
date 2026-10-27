/**
 * What the email integration needs before it can connect, and whether it has it.
 *
 * Only the NAMES of settings ever leave this file (for the Settings checklist),
 * never their values. Nothing here pretends to be connected: when a setting is
 * missing, Settings lists it and the connect buttons stay off.
 */
import { isDemoLoginEnabled } from "../auth.server";
import { parseTokenKey } from "./crypto.server";

export const EMAIL_PROVIDERS = ["google", "microsoft"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const isEmailProvider = (value: unknown): value is EmailProvider =>
  typeof value === "string" && (EMAIL_PROVIDERS as readonly string[]).includes(value);

/** The path every provider sends the admin back to after they approve access. */
export const CALLBACK_PATH = "/app/admin/email/callback";

/** Settings both providers need. */
export const SHARED_SETTINGS = ["EMAIL_TOKEN_KEY", "APP_URL"] as const;
/** Settings each provider needs (MS_TENANT_ID is optional; it defaults to "organizations"). */
export const PROVIDER_SETTINGS: Record<EmailProvider, readonly string[]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  microsoft: ["MS_CLIENT_ID", "MS_CLIENT_SECRET"],
};

export type SettingState = { name: string; state: "set" | "missing" | "invalid" };

export type ProviderSetup = {
  provider: EmailProvider;
  settings: SettingState[];
  /** Every setting this provider needs (shared ones included) is set and valid. */
  ready: boolean;
};

export type EmailSetup = {
  shared: SettingState[];
  providers: ProviderSetup[];
  /** The full redirect URI to register with each provider, or null until APP_URL is set. */
  redirectUri: string | null;
  callbackPath: string;
  /** Demo mode: email features refuse (owner decision 4). */
  demoMode: boolean;
  /** At least one provider can connect. */
  anyReady: boolean;
};

const env = (name: string): string => (process.env[name] ?? "").trim();

/** APP_URL without a trailing slash, or null when unset or not an http(s) URL. */
export function appUrl(): string | null {
  const raw = env("APP_URL");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function redirectUri(): string | null {
  const base = appUrl();
  return base ? `${base}${CALLBACK_PATH}` : null;
}

function settingState(name: string): SettingState {
  const value = env(name);
  if (!value) return { name, state: "missing" };
  if (name === "EMAIL_TOKEN_KEY" && !parseTokenKey(value)) return { name, state: "invalid" };
  if (name === "APP_URL" && !appUrl()) return { name, state: "invalid" };
  return { name, state: "set" };
}

/** The Settings checklist: names and states only. */
export function emailSetup(): EmailSetup {
  const shared = SHARED_SETTINGS.map(settingState);
  const sharedOk = shared.every((s) => s.state === "set");
  const providers = EMAIL_PROVIDERS.map((provider) => {
    const settings = PROVIDER_SETTINGS[provider].map(settingState);
    return { provider, settings, ready: sharedOk && settings.every((s) => s.state === "set") };
  });
  return {
    shared,
    providers,
    redirectUri: redirectUri(),
    callbackPath: CALLBACK_PATH,
    demoMode: isDemoLoginEnabled(),
    anyReady: providers.some((p) => p.ready),
  };
}

export function providerReady(provider: EmailProvider): boolean {
  return emailSetup().providers.find((p) => p.provider === provider)?.ready ?? false;
}

/** Server-only: the OAuth client for a provider. Throws when it isn't configured. */
export function oauthClient(provider: EmailProvider): { clientId: string; clientSecret: string; redirectUri: string; tenant: string } {
  const uri = redirectUri();
  const [idName, secretName] = PROVIDER_SETTINGS[provider];
  const clientId = env(idName);
  const clientSecret = env(secretName);
  if (!uri || !clientId || !clientSecret) throw new Error(`${provider} email is not configured`);
  return { clientId, clientSecret, redirectUri: uri, tenant: env("MS_TENANT_ID") || "organizations" };
}
