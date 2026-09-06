import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Vitests Default-Glob laesst Punkt-Verzeichnisse aus; der Test fuer den
    // PreToolUse-Hook liegt aber neben dem Hook selbst in .claude/hooks/.
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", ".claude/**/*.test.ts"],
  },
});
