import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

// Check if DATABASE_URL is provided
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set!");
}

// Parse connection string and force IPv4
function getPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  
  // Extract host from connection string
  let host = '';
  const match = connectionString?.match(/@([^:]+):/);
  if (match) {
    host = match[1];
  }
  
  console.log(`Connecting to database host: ${host}`);
  
  return {
    connectionString: process.env.DATABASE_URL,
    max: 1, // Limit connections for serverless
    ssl: {
      rejectUnauthorized: false,
    },
    // Force IPv4
    family: 4,
  };
}

// Use pg Pool for PostgreSQL connection
const pool = new pg.Pool(getPoolConfig());

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });
