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

    // answer_details - part-level correctness booleans + earned_score (never migrated)
    `ALTER TABLE answer_details ADD COLUMN IF NOT EXISTS word_correct BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE answer_details ADD COLUMN IF NOT EXISTS pos_correct BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE answer_details ADD COLUMN IF NOT EXISTS meaning_correct BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE answer_details ADD COLUMN IF NOT EXISTS earned_score INTEGER NOT NULL DEFAULT 0`,

    // student_submissions - email / warning / violations
    `ALTER TABLE student_submissions ADD COLUMN IF NOT EXISTS student_email TEXT`,
    `ALTER TABLE student_submissions ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE student_submissions ADD COLUMN IF NOT EXISTS violations_json TEXT`,

    // text_submissions - same trio + max_score / feedback
    `ALTER TABLE text_submissions ADD COLUMN IF NOT EXISTS student_email TEXT`,
    `ALTER TABLE text_submissions ADD COLUMN IF NOT EXISTS max_score INTEGER NOT NULL DEFAULT 100`,
    `ALTER TABLE text_submissions ADD COLUMN IF NOT EXISTS feedback TEXT`,
    `ALTER TABLE text_submissions ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE text_submissions ADD COLUMN IF NOT EXISTS violations_json TEXT`,

    // answer_sheet_submissions
    `ALTER TABLE answer_sheet_submissions ADD COLUMN IF NOT EXISTS mixed_class TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE answer_sheet_submissions ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE answer_sheet_submissions ADD COLUMN IF NOT EXISTS violations_json TEXT`,

    // exams - early fields not in prod DB
    `ALTER TABLE exams ADD COLUMN IF NOT EXISTS correct_text TEXT`,
    `ALTER TABLE exams ADD COLUMN IF NOT EXISTS submission_mode TEXT NOT NULL DEFAULT 'text'`,

    // Backfill: for rows still in the default-false state, derive from is_correct
    // Only touches rows where all three booleans are false (i.e. untouched after the columns
    // were added) and is_correct is true — cannot clobber rescored data.
    `UPDATE answer_details SET word_correct = TRUE, pos_correct = TRUE, meaning_correct = TRUE WHERE word_correct = FALSE AND pos_correct = FALSE AND meaning_correct = FALSE AND is_correct = TRUE`,
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
