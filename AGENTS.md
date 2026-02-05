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

## Getting Started

If the user hasn't given clear guidance on what to build, ask clarifying questions before writing code. Good questions to consider:

- What problem is this solving? Who will use it?
- What are the 2-3 core features or screens needed?
- Any specific UI style preferences (minimal, playful, dashboard-like)?
- Will this need any add-ons like charts, AI integration, or markdown rendering?

**Approach:**
- Get something visible quickly - a basic layout with placeholder content
- Build one feature at a time, validating direction as you go
- Prefer simple implementations over clever abstractions

Once the project has clear direction, feel free to delete or replace this section with project-specific context.

## Project Context

This prototype may eventually be ported to a production Remix/React Router application. Keep code patterns compatible where possible.
