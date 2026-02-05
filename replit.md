# English Dictation App

A web-based dictation testing application for school classrooms supporting two exam types: Vocabulary Dictation and Text Dictation. Teachers can create exams with automatic sentence splitting and AI-powered scoring. Students take tests on their iPads with anti-cheating measures.

## Overview

This application allows:
- **Teachers**: Create two types of exams:
  - **Vocabulary Dictation**: Word | POS | Meaning format with weighted scoring (100-point scale)
  - **Text Dictation**: Sentence-by-sentence input with AI evaluation (Poe API / Gemini-3-Flash) (100-point scale)
- **Students**: Access exams via unique links provided by teachers, login with their details, take the test, and receive immediate feedback on their score

## Tech Stack

- **Frontend**: React + TypeScript, TailwindCSS, Shadcn UI components, Wouter routing, TanStack Query
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Export**: ExcelJS library for Excel export

## Routing Structure

- `/` - Admin login (homepage)
- `/admin` - Admin login
- `/admin/dashboard` - Admin dashboard with exam management
- `/admin/create-exam` - Create new exam
- `/admin/edit-exam/:id` - Edit existing exam
- `/admin/submissions/:examId` - Submission management with analytics and score editing
- `/teacher/quick-build` - Quick Answer Sheet Builder for batch MC/fill-in-blank creation
- `/sheet/:id` - Student answer sheet view with instant grading
- `/exam/:id` - Student login for specific exam (unique link per exam)
- `/exam/:id/test` - Student exam page
- `/thank-you` - Score display after submission

## Key Features

### Student Interface (`/exam/:id`)
- Each exam has a unique URL that teachers can share with students
- Students login with name, student number (1-40), original class (J3A/J3B/J3C), mixed class
- Each vocabulary question has 3 input fields: English Word, Part of Speech, Chinese Meaning
- Anti-cheating measures:
  - All inputs have `autocomplete="off"`, `autocorrect="off"`, `autocapitalize="off"`, `spellcheck="false"`
  - Paste prevention on all input fields
  - Tab/window visibility change detection with alert warning
- Grading: All 3 parts must match (English word/POS: case-insensitive, Chinese meaning: exact match)
- Immediate score display after submission (out of 100 points)

### Teacher Admin Panel (`/` or `/admin`)
- Homepage is now the admin login (password protected via env var: ADMIN_PASSWORD)
- Create exams with vocabulary format: `Word | POS | Meaning` (one vocabulary per line)
  - Example: `Apple | n. | 蘋果`
- Real-time preview showing parsed vocabularies with validation
- **Multiple exams can run simultaneously** - no more single active exam restriction
- Each exam displays its unique student link for easy sharing
- Copy link button to share exam URL with students
- View all submissions with scores
- Export to Excel with expanded columns per question

### Submission Management (`/admin/submissions/:examId`)
- **Detailed Submission View**: View each student's answers compared to correct answers with visual indicators (green for correct, red for incorrect)
- **Score Editing**: Teachers can manually adjust individual question/sentence scores and total score
- **Analytics Dashboard**:
  - Total submissions count
  - Average score, highest score, lowest score
  - Pass rate (≥60 points)
  - Score distribution chart (10-point buckets: 0-9, 10-19, ..., 90-100)
  - Per-question difficulty analysis (vocab exams): word/POS/meaning correct rates
  - Per-sentence performance analysis (text exams): average earned score per sentence
- **Filtering & Sorting**:
  - Search by student name or student number
  - Filter by original class (J3A/J3B/J3C)
  - Filter by score range: excellent (≥90), pass (≥60), fail (<60)

### Quick Answer Sheet Builder (`/teacher/quick-build`)
A standalone module for rapidly creating auto-grading answer keys without going question-by-question.

**Bulk MC Generator (Tool A)**:
- Set start/end question numbers and options pattern (A-D or A-E)
- Paste answer key string (e.g., "ABCDABCD...")
- Automatically generates MC questions with correct answers

**Bulk Fill-in-Blank Generator (Tool B)**:
- Set start/end question numbers
- Enter answers one per line
- Maps each line to corresponding question number

**Features**:
- Live preview of generated questions
- Edit/delete individual items before saving
- Stores answer sheets with Google Drive PDF link
- Copy student link for sharing

### Student Answer Sheet (`/sheet/:id`)
- iPad-optimized layout with split screen design
- Login with name, student number, class
- MC questions show clickable circle buttons (A/B/C/D/E)
- Fill-in-blank questions show text input boxes
- View paper button opens linked PDF
- Instant grading on submit with correct/incorrect indicators

### 100-Point Scoring System
- All exams are scored out of 100 points maximum
- **Vocabulary Dictation**: Points distributed across questions (50% Word, 25% POS, 25% Meaning)
- **Text Dictation**: Points distributed evenly across sentences

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

### Answer Sheet Builder
- **answer_sheet_sessions**: id, title, paper_link, items_json (JSON array of QuestionItem), created_at
- **answer_sheet_submissions**: id, session_id, student_name, student_number, original_class, answers_json, total_score, max_score, submitted_at
- **QuestionItem interface**: { id: number, type: 'mc' | 'text', correct: string, options?: string[] }

## API Endpoints

- `POST /api/admin/login` - Admin authentication
- `GET /api/exams` - List all exams
- `GET /api/exams/active` - Get active exam with questions (vocab) or sentences (text)
- `GET /api/exams/:id` - Get exam by ID with questions or sentences
- `POST /api/exams` - Create new exam (body: { title, vocabularies?, correctText?, isActive, examType })
- `PATCH /api/exams/:id` - Update exam (toggle active)
- `DELETE /api/exams/:id` - Delete exam
- `GET /api/submissions` - List all vocab submissions
- `GET /api/submissions/:id` - Get vocab submission with answer details
- `POST /api/submissions` - Submit vocab exam answers
- `PATCH /api/submissions/:id` - Update vocab submission score (admin adjust)
- `GET /api/text-submissions` - List all text submissions
- `GET /api/text-submissions/:id` - Get text submission with answer details
- `POST /api/text-submissions` - Submit text dictation (supports sentenceAnswers array for per-sentence scoring)
- `PATCH /api/text-submissions/:id` - Update text submission score (admin adjust)
- `GET /api/exams/:id/analytics` - Get analytics for an exam (stats, distribution, difficulty analysis)
- `GET /api/export?examId=X` - Export to Excel
- `GET /api/answer-sheets` - List all answer sheet sessions
- `GET /api/answer-sheets/:id` - Get answer sheet by ID
- `POST /api/answer-sheets` - Create answer sheet (body: { title, paperLink, items })
- `PATCH /api/answer-sheets/:id` - Update answer sheet
- `DELETE /api/answer-sheets/:id` - Delete answer sheet
- `POST /api/answer-sheets/:id/submit` - Submit student answers for grading
- `GET /api/answer-sheets/:id/submissions` - Get submissions for an answer sheet

## Running the Application

The app runs on port 5000 with `npm run dev`. The database is automatically seeded with a sample exam on first startup.

## User Preferences

- Mobile-responsive design optimized for iPad use
- Clean, professional UI with Shadcn components
- Anti-cheating input controls for all answer fields
- Chinese (Traditional) support for vocabulary meanings
