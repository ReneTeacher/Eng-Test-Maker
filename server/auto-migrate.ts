import { db } from "./db";
import { sql } from "drizzle-orm";

// Idempotent schema sync. Runs on every startup; only adds missing columns.
// Safe because ADD COLUMN IF NOT EXISTS never drops or modifies existing data.
export async function autoMigrate() {
  const statements = [
    // exams table - definition dictation + email report toggle
    `ALTER TABLE exams ADD COLUMN IF NOT EXISTS has_definition_dictation BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE exams ADD COLUMN IF NOT EXISTS definition_ratio INTEGER NOT NULL DEFAULT 20`,
    `ALTER TABLE exams ADD COLUMN IF NOT EXISTS enable_email_report BOOLEAN NOT NULL DEFAULT TRUE`,

    // questions table - per-question definition fields
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS correct_definition TEXT`,
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS definition_score INTEGER NOT NULL DEFAULT 0`,

    // answer_details table - student definition + scoring
    `ALTER TABLE answer_details ADD COLUMN IF NOT EXISTS student_definition TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE answer_details ADD COLUMN IF NOT EXISTS definition_earned_score INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE answer_details ADD COLUMN IF NOT EXISTS definition_feedback TEXT`,
  ];

  let failures = 0;
  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (err) {
      failures++;
      console.error(`!!! AUTO-MIGRATE FAILED for: ${stmt}`);
      console.error(err);
      process.stderr.write(`AUTO-MIGRATE FAILED: ${stmt}\n`);
    }
  }
  if (failures > 0) {
    console.error(`Auto-migration completed with ${failures} failure(s). DB may be out of sync.`);
  } else {
    console.log("Auto-migration complete");
  }
}
