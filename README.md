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

## Deploying as an Easel Application

Easel hosts lab school apps on Playlab's AWS infrastructure through DuploCloud.
Each school gets its own tenants, and the infra side lives in
[duplocloud-infrastructure](https://github.com/playlab-education/duplocloud-infrastructure)
(`modules/exttenant`, `components/extapp`). This repo already has what an app needs
to deploy there:

- `Dockerfile`: the production image
- `terraform/main.tf`: one `extapp` block; the tenant, nodes, image repo, URL and
  cert all come from the app's entry in `config/exttenant/schools.tfvars`
- `.github/workflows/deploy.yml`: builds and deploys the app, then prints its URL
- `.github/workflows/plan.yml`: comments the Terraform plan on PRs that change `terraform/`

This repo is the `home` app of the `template` school:

| Environment | Tenant | Deploys | URL |
|---|---|---|---|
| dev | `exdtemplate` | every push to `main` | `https://template-home.dev.labschools.ai` |
| prod | `exttemplate` | by hand only (Actions → Deploy → Run workflow), from `main` | not yet: prod has no domain |

### Setup

1. **Register the app under its school.** In duplocloud-infrastructure, add it to
   the school's `apps` in `config/exttenant/schools.tfvars` and merge. The Ext
   Tenant workflow then creates the tenants, this repo's GitHub environments
   (one per tenant) and its image registries.
   ```hcl
   template = {
     apps = {
       home = {
         repo = "webapp-prototype-template"
         # db = "home"  # optional: a database, as an <app>-db secret (DATABASE_URL)
       }
     }
   }
   ```
2. **Do the manual steps below.**
3. **Push to `main`.** The Deploy workflow builds the image, deploys to dev, and
   ends with "Your app is live at https://…".

### Manual steps

These aren't automated, so someone does them by hand for each new repo:

- **Give the repo the `DUPLO_TOKEN` org secret.** It's an organization secret
  shared only with selected repositories, so a GitHub org admin adds this repo
  to it: org **Settings → Secrets and variables → Actions → `DUPLO_TOKEN` →
  Repository access**. Without it, the build fails to log in to Duplo.
- **Give the `playlab-education` GitHub App access to the repo**, before the
  Ext Tenant apply: org **Settings → GitHub Apps → playlab-education →
  Configure → Repository access**. Terraform uses it to create the repo's
  GitHub environments; without it the apply fails with a 404 on
  `.../environments/<tenant>`.
- **Check the repo can read the `DUPLO_HOST` variable** (same page, under
  **Variables**), if it's also limited to selected repositories.
- **Run the first prod deploy by hand** once dev works: Actions → Deploy → Run
  workflow, with `exttemplate` and `apply`, from `main`.

### Making a new app from this template

- **Name it** by setting `name` in `terraform/main.tf` to the app's key under its
  school in `schools.tfvars`. Its Terraform state is kept per repo automatically.
- **Pick its school** by replacing `exdtemplate` / `exttemplate` in both
  workflows with `exd<school>` / `ext<school>`, and register the app under that
  school (step 1 above).
- **The server must listen on `PORT`** (3000) and answer `/healthcheck` with a
  200, which is the health check (`app/routes/healthcheck.ts`). `npm run start`
  already does both.

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
