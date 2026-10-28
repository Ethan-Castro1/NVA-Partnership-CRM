# Coding Assistant Guidance

This is a prototype/sandbox repository using React Router 7 for rapid experimentation.

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server

## Tech Stack

- **Framework:** React Router 7 (framework mode with SSR)
- **Styling:** Tailwind CSS
- **Icons:** Lucide React (`lucide-react`)
- **UI Primitives:** Headless UI (`@headlessui/react`)
- **Positioning:** Floating UI (`@floating-ui/react`)
- **Validation:** Zod
- **Class Utilities:** `tailwind-merge`

## Recommended Add-ons

Install these as needed for specific prototypes:

### Charts & Data Visualization
```bash
npm install recharts
```

### Animation
```bash
npm install framer-motion
```

### Markdown Rendering
```bash
npm install react-markdown remark-gfm
```

### AI Integration

**Anthropic Claude:**
```bash
npm install @anthropic-ai/sdk
```

**OpenAI:**
```bash
npm install openai
```

**Google Gemini:**
```bash
npm install @google/genai
```

**Vercel AI SDK** (unified interface, streaming helpers):
```bash
npm install ai
```

## Code Patterns

### Class Name Utilities
Use `tailwind-merge` for combining Tailwind classes:
```tsx
import { twMerge } from 'tailwind-merge';

const className = twMerge('px-4 py-2', conditionalClass && 'bg-blue-500');
```

### Icons
```tsx
import { Search, Menu, X } from 'lucide-react';

<Search className="w-5 h-5" />
```

### Validation
```tsx
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});
```

## Project: NVA Village Partners

A bilingual (English/Spanish) partnership CRM for New Village Academy, Annapolis.
Community members sign up at `/join` to teach a skills lesson, volunteer in a class,
host an internship or partner on a Community Action Project (CAP). Two roles sign in at
`/login` (email + password; admins create accounts): **staff** (Search, Connect, Arrange: find
approved resources, request introductions, track their requests) and **admin** (the full CRM:
contacts, opportunities, follow-ups, staff requests, sign-up review, email). Spec:
`docs/requirements.md`; build plan and ownership: `docs/build-contract.md`.

- **Permissions are server side:** every read takes a `viewer`; `app/lib/permissions.server.ts`
  (`staffVisibleSql`, `requireAdminViewer`). Staff never receive notes, funding focus, origin, owner,
  opportunities, follow-ups, email, intake or hidden people; contact details only when `contact_mode='direct'`.
- **History:** `app/lib/history.server.ts` `recordHistory` never changes `people.status` unless asked.
- **CRM modules:** `opportunities.server.ts`, `follow-ups.server.ts`, `requests.server.ts`, `intake.server.ts`,
  `saved.server.ts`, `duplicates.server.ts`, `search-language.ts`, `dashboard.server.ts`, `app/lib/email/*`
  (Google/Microsoft OAuth; needs `EMAIL_TOKEN_KEY`, `APP_URL`, client ids; Settings lists what is missing),
  `app/lib/ai/drafts.server.ts` (drafts are never sent without explicit approval).
- **Client code must not import values from `*.server` modules** (the build fails); shared constants go in
  `app/lib/constants.ts`.

- **Data:** `app/lib/schema.server.ts` (runs at startup, idempotent; add columns with
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Adults only: never store student data.
- **Database:** `DATABASE_URL` (Postgres) when deployed; embedded PGlite in `.data/pglite`
  locally. Only one process can open PGlite: stop `npm run dev` before `npm run seed`.
- **Core logic:** `app/lib/people.server.ts` (search, profiles, relationships, intro paths),
  `app/lib/caps.server.ts`, `app/lib/auth.server.ts`, `app/lib/ai/*` (the Playlab API: `PLAYLAB_API_KEY` +
  `PLAYLAB_PROJECT_ID`, a published Playlab app; setup in `docs/playlab-app.md`. `ANTHROPIC_API_KEY` still works when those are unset).
- **Bilingual:** every string goes through `useT()`/`t("namespace.key")`; one dictionary
  file per feature in `app/i18n/`, Spanish must have every English key (TypeScript checks).
  No em dashes in user-facing copy.
- **Design:** NVA brand kit over a calm editorial style. Tokens in `app/app.css`; shared
  pieces in `app/components/nva.tsx`; shadcn/ui in `app/components/ui` (sidebar-07 shell).
  Gold `#faad00` is the one spark (never as text colour; use `text-gold-ink`); the four
  ways to help are rust, blue, purple and sage dots (`CONTRIBUTION_COLOR`).

- **Public pages:** `/` redirects to the sign-up form (`/join`); `/home` is a short welcome. The public
  form offers practical skills, school volunteer, after-school and other; staff add CAP partners,
  internship hosts and funders at `/app/people/new`.
- **CAPs:** this semester's CAPs (from the CAP Selection Guide) live in `app/lib/cap-catalog.ts` and are
  seeded by `app/lib/cap-catalog.server.ts`. A CAP key doubles as a person's CAP topic tag.
- **Assistant:** AI SDK `useChat` on the client (`app/components/assistant/*`), streaming route
  `app/routes/app.assistant.chat.ts`, Claude tool loop in `app/lib/ai/assistant.server.ts`. Chats are saved
  per staff member (`assistant_chats`). The panel lives in the app layout: it docks beside the page from 2xl (1536px)
  and stays open across pages; below that it is an overlay sheet (a dialog) that doesn't shift the page.
  The "Watch an example" walkthrough is scripted with `@shadcn/helpers/ai-sdk`.
- **MCP connector:** `/mcp/<key>` (stateless Streamable HTTP, `app/lib/ai/mcp.server.ts`) exposes the same
  read-only tools to Claude or ChatGPT. Staff make personal keys at `/app/connect`.

### Local development

```bash
npm install
npm run seed        # fictional demo data + logins (admin@nva.test / teacher@nva.test, password village-demo-2026)
npm run dev         # http://localhost:5173 (DEMO_LOGIN=true: /login shows Continue as Administrator / Staff)
npm run dev:login   # same, but email and password sign-in only
npm test            # vitest, in-memory database
npm run typecheck
```

Put `PLAYLAB_API_KEY` and `PLAYLAB_PROJECT_ID` in `.env.local` (gitignored; see `docs/playlab-app.md`) to turn on the AI
assistant, email drafts and web lead write-ups (web search itself needs `EXA_API_KEY`). Without it, search and the connection finder still work and the assistant
falls back to plain search.

## Project Context

This prototype may eventually be ported to a production Remix/React Router application. Keep code patterns compatible where possible.
