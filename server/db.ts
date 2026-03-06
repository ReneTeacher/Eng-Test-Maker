import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

// Check if DATABASE_URL is provided
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set!");
}

// Use pg Pool for PostgreSQL connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, // Limit connections for serverless
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });
