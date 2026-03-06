import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

// Check if DATABASE_URL is provided
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set!");
}

// Parse connection string to extract parameters
function parseDatabaseUrl(url: string) {
  // Format: postgresql://user:password@host:port/database
  const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    throw new Error("Invalid DATABASE_URL format");
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4], 10),
    database: match[5],
  };
}

// Create pool with explicit parameters
const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL!);
console.log(`Connecting to database: ${dbConfig.host}:${dbConfig.port}`);

const pool = new pg.Pool({
  user: dbConfig.user,
  password: dbConfig.password,
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  max: 1,
  ssl: {
    rejectUnauthorized: false,
  },
  family: 4, // Force IPv4
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });
