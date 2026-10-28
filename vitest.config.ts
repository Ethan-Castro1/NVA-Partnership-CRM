import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["app/**/*.test.ts", "scripts/**/*.test.ts"],
    // Each test file gets its own in-memory database; never touches .data/.
    env: { PGLITE_DIR: "memory://", DATABASE_URL: "", ANTHROPIC_API_KEY: "", PLAYLAB_API_KEY: "", PLAYLAB_PROJECT_ID: "", EXA_API_KEY: "" },
    pool: "forks",
    // Password hashing (scrypt) is deliberately slow; give cold starts room.
    testTimeout: 20000,
  },
});
