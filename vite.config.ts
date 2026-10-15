import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  // Server code reads keys from process.env (OPENROUTER_API_KEY, EXA_API_KEY, ...).
  // Locally they live in .env / .env.local; real environment variables win.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    process.env[key] ??= value;
  }
  return { plugins: [tailwindcss(), reactRouter(), tsconfigPaths()] };
});
