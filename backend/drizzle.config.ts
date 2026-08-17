import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations-sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: "./db/local.sqlite"
  }
});
