# English Dictation App

A web-based dictation testing application for school classrooms. Teachers can create vocabulary exams, and students can take tests on their iPads with anti-cheating measures.

## Overview

This application allows:
- **Teachers**: Create dictation exams, manage active tests, view submissions, and export results to Excel
- **Students**: Login with their details, take the active exam, and receive immediate feedback on their score

## Tech Stack

- **Frontend**: React + TypeScript, TailwindCSS, Shadcn UI components, Wouter routing, TanStack Query
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Export**: XLSX library for Excel export

## Key Features

### Student Interface (`/`)
- Login with name, student number (1-40), original class (J3A/J3B/J3C), mixed class
- Input fields have `autocomplete="off"`, `autocorrect="off"`, `autocapitalize="off"`, `spellcheck="false"` to prevent cheating
- Case-insensitive answer grading
- Immediate score display after submission

### Teacher Admin Panel (`/admin`)
- Password protected (default: "teacher123")
- Create exams with title and word list (one word per line)
- Toggle exam active status (only one can be active)
- View all submissions with scores
- Export to Excel with dynamic columns: Name, Student Number, Original Class, Mixed Class, Q1_Answer... Qn_Answer, Total Score, Timestamp

## Database Schema

- **exams**: id, title, is_active, created_at
- **questions**: id, exam_id, word_order, correct_answer
- **student_submissions**: id, exam_id, student_name, student_number, original_class, mixed_class, total_score, submitted_at
- **answer_details**: id, submission_id, question_id, student_answer, is_correct

## API Endpoints

- `POST /api/admin/login` - Admin authentication
- `GET /api/exams` - List all exams
- `GET /api/exams/active` - Get active exam with questions
- `POST /api/exams` - Create new exam
- `PATCH /api/exams/:id` - Update exam (toggle active)
- `DELETE /api/exams/:id` - Delete exam
- `GET /api/submissions` - List all submissions
- `POST /api/submissions` - Submit exam answers
- `GET /api/export?examId=X` - Export to Excel

## Running the Application

The app runs on port 5000 with `npm run dev`. The database is automatically seeded with a sample exam on first startup.

## User Preferences

- Mobile-responsive design optimized for iPad use
- Clean, professional UI with Shadcn components
- Anti-cheating input controls for all answer fields
