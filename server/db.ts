import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

// Use pg Pool for PostgreSQL connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, // Limit connections for serverless
});

export const db = drizzle(pool, { schema });
