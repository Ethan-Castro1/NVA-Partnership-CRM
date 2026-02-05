# Webapp Prototype

A React Router 7 prototype environment optimized for AI-assisted development.

## Tech Stack

- **Framework:** React Router 7 (SSR, file-based routing)
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **UI Primitives:** Headless UI
- **Validation:** Zod

## Creating a New Prototype

### Option 1: Run Setup Script

Run this in a terminal (Terminal, iTerm, VS Code, etc.):

```bash
bash <(curl -fsSL https://gist.githubusercontent.com/adam-playlab/ef604b314308df010347eab1c8e5efe5/raw/create-webapp-prototype.sh)
```

You'll be prompted for a project name. Once complete, optionally push to GitHub:

```bash
cd your-project-name
gh repo create your-project-name --private --source=. --push
```

### Option 2: Use GitHub Template

Click **"Use this template"** on GitHub to create a new repository, then:

```bash
git clone https://github.com/YOUR_USERNAME/your-new-repo.git
cd your-new-repo
npm install
```

## Getting Started

Once you have a prototype set up:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

> **Note:** If you cloned an existing prototype repo, run `npm install` first to install dependencies.

## Working with AI Assistants

This template includes an `AGENTS.md` file with guidance for AI coding assistants (Claude Code, Cursor, etc.). The file documents:

- Available tech stack and patterns
- Recommended add-on packages for charts, animation, AI integration
- Code conventions to follow

When starting a new prototype, just describe what you want to build. The AI will ask clarifying questions if needed.

## Add-ons

Install these as needed:

```bash
# Charts
npm install recharts

# Animation
npm install framer-motion

# Markdown rendering
npm install react-markdown remark-gfm

# AI integration (pick one or more)
npm install @anthropic-ai/sdk  # Claude
npm install openai              # OpenAI
npm install @google/genai       # Gemini
npm install ai                  # Vercel AI SDK
```

See `AGENTS.md` for more details.
