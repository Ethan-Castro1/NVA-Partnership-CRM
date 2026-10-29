import * as build from "../build/server/index.js";
import { vercelListener } from "./_listener.mjs";

/** Vercel's function entry: the whole app (see _listener.mjs). */
export default vercelListener(build);
