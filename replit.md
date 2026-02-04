# English Dictation App

A web-based vocabulary dictation testing application for school classrooms. Teachers can create vocabulary exams with Word | Part of Speech | Meaning format, and students can take tests on their iPads with anti-cheating measures.

## Overview

This application allows:
- **Teachers**: Create vocabulary exams (Word | POS | Meaning format), manage active tests, view submissions, and export results to Excel
- **Students**: Login with their details, take the active exam with 3 input fields per vocabulary, and receive immediate feedback on their score

## Tech Stack

- **Frontend**: React + TypeScript, TailwindCSS, Shadcn UI components, Wouter routing, TanStack Query
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Export**: ExcelJS library for Excel export

## Key Features

### Student Interface (`/`)
- Login with name, student number (1-40), original class (J3A/J3B/J3C), mixed class
- Each vocabulary question has 3 input fields: English Word, Part of Speech, Chinese Meaning
- Anti-cheating measures:
  - All inputs have `autocomplete="off"`, `autocorrect="off"`, `autocapitalize="off"`, `spellcheck="false"`
  - Paste prevention on all input fields
  - Tab/window visibility change detection with alert warning
- Grading: All 3 parts must match (English word/POS: case-insensitive, Chinese meaning: exact match)
- Immediate score display after submission

### Teacher Admin Panel (`/admin`)
- Password protected (env var: ADMIN_PASSWORD, default: "admin123")
- Create exams with vocabulary format: `Word | POS | Meaning` (one vocabulary per line)
  - Example: `Apple | n. | 蘋果`
- Real-time preview showing parsed vocabularies with validation
- Toggle exam active status (only one can be active)
- View all submissions with scores
- Export to Excel with expanded columns per question:
  - Q{n}_StudentWord, Q{n}_StudentPOS, Q{n}_StudentMeaning
  - Q{n}_CorrectWord, Q{n}_CorrectPOS, Q{n}_CorrectMeaning
  - Q{n}_Correct (Yes/No)

## Database Schema

- **exams**: id, title, is_active, created_at
- **questions**: id, exam_id, word_order, correct_word, correct_pos, correct_meaning
- **student_submissions**: id, exam_id, student_name, student_number, original_class, mixed_class, total_score, submitted_at
- **answer_details**: id, submission_id, question_id, student_word, student_pos, student_meaning, is_correct

## API Endpoints

- `POST /api/admin/login` - Admin authentication
- `GET /api/exams` - List all exams
- `GET /api/exams/active` - Get active exam with questions
- `POST /api/exams` - Create new exam (body: { title, vocabularies, isActive })
- `PATCH /api/exams/:id` - Update exam (toggle active)
- `DELETE /api/exams/:id` - Delete exam
- `GET /api/submissions` - List all submissions
- `POST /api/submissions` - Submit exam answers (body includes answers array with studentWord, studentPos, studentMeaning)
- `GET /api/export?examId=X` - Export to Excel

## Running the Application

The app runs on port 5000 with `npm run dev`. The database is automatically seeded with a sample exam on first startup.

## User Preferences

- Mobile-responsive design optimized for iPad use
- Clean, professional UI with Shadcn components
- Anti-cheating input controls for all answer fields
- Chinese (Traditional) support for vocabulary meanings
