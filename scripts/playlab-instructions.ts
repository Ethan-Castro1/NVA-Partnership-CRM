/**
 * Prints the Playlab app's instructions (paste them into the app's instructions box),
 * or with --write refreshes docs/playlab-instructions.txt.
 *
 *   npm run playlab:instructions
 *   npm run playlab:instructions -- --write
 */
import { writeFileSync } from "node:fs";
import { playlabAppInstructions } from "../app/lib/ai/playlab-instructions.server";

const text = playlabAppInstructions();
if (process.argv.includes("--write")) {
  writeFileSync(new URL("../docs/playlab-instructions.txt", import.meta.url), `${text}\n`);
  console.log("Wrote docs/playlab-instructions.txt");
} else {
  console.log(text);
}
