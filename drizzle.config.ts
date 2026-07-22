import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("NEON_DATABASE_URL não configurada. Configure o secret com a connection string do Neon.");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
