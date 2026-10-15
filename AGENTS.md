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
host an internship or partner on a Community Action Project (CAP). Staff sign in at
`/login` (email + password; admins create accounts) to search people, ask the AI
assistant, find second-degree connections, and manage CAPs.

- **Data:** `app/lib/schema.server.ts` (runs at startup, idempotent; add columns with
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Adults only: never store student data.
- **Database:** `DATABASE_URL` (Postgres) when deployed; embedded PGlite in `.data/pglite`
  locally. Only one process can open PGlite: stop `npm run dev` before `npm run seed`.
- **Core logic:** `app/lib/people.server.ts` (search, profiles, relationships, intro paths),
  `app/lib/caps.server.ts`, `app/lib/auth.server.ts`, `app/lib/ai/*` (Claude, `claude-opus-5-5`).
- **Bilingual:** every string goes through `useT()`/`t("namespace.key")`; one dictionary
  file per feature in `app/i18n/`, Spanish must have every English key (TypeScript checks).
  No em dashes in user-facing copy.
- **Design:** NVA brand kit over a calm editorial style. Tokens in `app/app.css`; shared
  pieces in `app/components/nva.tsx`; shadcn/ui in `app/components/ui` (sidebar-07 shell).
  Gold `#faad00` is the one spark (never as text colour; use `text-gold-ink`); the four
  ways to help are rust, blue, purple and sage dots (`CONTRIBUTION_COLOR`).

### Local development

```bash
npm install
npm run seed        # fictional demo data + logins (admin@nva.test / teacher@nva.test, password village-demo-2026)
npm run dev         # http://localhost:5173 (no sign-in: you are the demo admin)
npm run dev:login   # same, but with real sign-in
npm test            # vitest, in-memory database
npm run typecheck
```

Start the server with `ANTHROPIC_API_KEY` set (`ANTHROPIC_API_KEY=sk-ant-... npm run dev`) to turn on the AI
assistant and web search for leads. Without it, search and the connection finder still work and the assistant
falls back to plain search.

## Project Context

This prototype may eventually be ported to a production Remix/React Router application. Keep code patterns compatible where possible.
