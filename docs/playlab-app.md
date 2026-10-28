# The Playlab app behind Village Partners

The app's AI (Ask the Village, email drafts, web leads) runs through the Playlab API. The API talks to a
published Playlab app, not to a raw model, so Village Partners needs one Playlab app of its own. The task
instructions live in that app (so Playlab can cache them), and each request names its task
(`Task: ask-the-village-staff`, `ask-the-village-admin`, `email-draft` or `web-leads`) and sends only that
request's data.

## Environment

| Variable | Value |
| --- | --- |
| `PLAYLAB_API_KEY` | An organization API key (`sk-pl-v1-org...`), from the organization's API Keys page. |
| `PLAYLAB_PROJECT_ID` | The Playlab app's id: the last part of its builder URL (`playlab.ai/build/<id>`). |
| `PLAYLAB_INSTRUCTIONS_IN_APP` | `true` once the app holds the instructions below. Unset, every request carries the full instructions itself (works, but nothing is cached). |
| `PLAYLAB_API_URL` | Optional. Defaults to `https://www.playlab.ai/api/v1`. |

The app must be in the same organization as the key, and it must be published (any audience). Locally the
values go in `.env.local` (gitignored). `ANTHROPIC_API_KEY` is still honoured when the Playlab values are not set.

## Setting up the Playlab app

1. Create an app in the organization that owns the key, for example "Village Partners engine".
2. Paste the whole of `docs/playlab-instructions.txt` into its instructions box (`npm run playlab:instructions`
   prints the same text).
3. Pick a model that follows instructions closely; set the temperature low (about 0.3).
4. Leave tools, references, starter inputs and instruction variables off.
5. Publish it, copy its id into `PLAYLAB_PROJECT_ID` and set `PLAYLAB_INSTRUCTIONS_IN_APP=true`.

The instructions are generated from the prompts in the code (`app/lib/ai/playlab-instructions.server.ts`).
After changing a prompt, run `npm run playlab:instructions -- --write` (a test fails until you do), paste the
new text into the app and republish it.

Every request is stored as a conversation in that app's history, including the CRM records sent with it
(admin requests can include private notes). Keep the app's builders to people who may see NVA's CRM.

## How the code uses it

`app/lib/ai/playlab.server.ts` holds the client: one Playlab conversation per request, starting with
`Task: <name>`, replies read from the
server-sent events stream (`append` events carry `delta` text). Drafts and web leads ask for one JSON object
(`playlabJson`). The assistant keeps its tool loop through a text protocol (`TOOL_PROTOCOL` in
`assistant.server.ts`): the model writes `<tool_call>{...}</tool_call>`, the server runs the tool with
`executeTool` (which checks the viewer's role and validates the input) and sends `<tool_result>` blocks back
in the same conversation. Tool requests are never streamed to the chat.
