# English Dictation App

A web-based dictation testing application for school classrooms supporting two exam types: Vocabulary Dictation and Text Dictation. Teachers can create exams with automatic sentence splitting and AI-powered scoring. Students take tests on their iPads with anti-cheating measures.

## Overview

This application allows:
- **Teachers**: Create two types of exams:
  - **Vocabulary Dictation**: Word | POS | Meaning format with weighted scoring
  - **Text Dictation**: Sentence-by-sentence input with AI evaluation (Poe API / Gemini-3-Flash)
- **Students**: Login with their details, take the active exam, and receive immediate feedback on their score with per-sentence breakdown

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

### Vocabulary Dictation
- **exams**: id, title, exam_type, is_active, correct_text, created_at
- **questions**: id, exam_id, word_order, correct_word, correct_pos, correct_meaning, word_score, pos_score, meaning_score
- **student_submissions**: id, exam_id, student_name, student_number, original_class, mixed_class, total_score, submitted_at
- **answer_details**: id, submission_id, question_id, student_word, student_pos, student_meaning, is_correct

### Text Dictation
- **text_sentences**: id, exam_id, sentence_order, correct_sentence, max_score (default: 10)
- **text_submissions**: id, exam_id, student_name, student_number, original_class, mixed_class, student_text, total_score, max_score, feedback, submitted_at
- **text_answer_details**: id, submission_id, sentence_id, student_sentence, earned_score, feedback

## API Endpoints

- `POST /api/admin/login` - Admin authentication
- `GET /api/exams` - List all exams
- `GET /api/exams/active` - Get active exam with questions (vocab) or sentences (text)
- `GET /api/exams/:id` - Get exam by ID with questions or sentences
- `POST /api/exams` - Create new exam (body: { title, vocabularies?, correctText?, isActive, examType })
- `PATCH /api/exams/:id` - Update exam (toggle active)
- `DELETE /api/exams/:id` - Delete exam
- `GET /api/submissions` - List all submissions
- `POST /api/submissions` - Submit vocab exam answers
- `POST /api/text-submissions` - Submit text dictation (supports sentenceAnswers array for per-sentence scoring)
- `GET /api/export?examId=X` - Export to Excel

## Running the Application

The app runs on port 5000 with `npm run dev`. The database is automatically seeded with a sample exam on first startup.

## User Preferences

- Mobile-responsive design optimized for iPad use
- Clean, professional UI with Shadcn components
- Anti-cheating input controls for all answer fields
- Chinese (Traditional) support for vocabulary meanings
