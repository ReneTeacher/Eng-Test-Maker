import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const exams = pgTable("exams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  examType: text("exam_type").notNull().default("vocabulary"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  correctText: text("correct_text"),
});

export const questions = pgTable("questions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  wordOrder: integer("word_order").notNull(),
  correctWord: text("correct_word").notNull(),
  correctPos: text("correct_pos").notNull(),
  correctMeaning: text("correct_meaning").notNull(),
  wordScore: integer("word_score").notNull().default(2),
  posScore: integer("pos_score").notNull().default(1),
  meaningScore: integer("meaning_score").notNull().default(1),
});

export const studentSubmissions = pgTable("student_submissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  studentNumber: integer("student_number").notNull(),
  originalClass: text("original_class").notNull(),
  mixedClass: text("mixed_class").notNull(),
  totalScore: integer("total_score").notNull(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const answerDetails = pgTable("answer_details", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  submissionId: integer("submission_id").notNull().references(() => studentSubmissions.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  studentWord: text("student_word").notNull(),
  studentPos: text("student_pos").notNull(),
  studentMeaning: text("student_meaning").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  wordCorrect: boolean("word_correct").notNull().default(false),
  posCorrect: boolean("pos_correct").notNull().default(false),
  meaningCorrect: boolean("meaning_correct").notNull().default(false),
  earnedScore: integer("earned_score").notNull().default(0),
});

export const textSubmissions = pgTable("text_submissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  studentNumber: integer("student_number").notNull(),
  originalClass: text("original_class").notNull(),
  mixedClass: text("mixed_class").notNull(),
  studentText: text("student_text").notNull(),
  totalScore: integer("total_score").notNull(),
  maxScore: integer("max_score").notNull().default(100),
  feedback: text("feedback"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const textSentences = pgTable("text_sentences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  sentenceOrder: integer("sentence_order").notNull(),
  correctSentence: text("correct_sentence").notNull(),
  maxScore: integer("max_score").notNull().default(10),
});

export const textAnswerDetails = pgTable("text_answer_details", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  submissionId: integer("submission_id").notNull().references(() => textSubmissions.id, { onDelete: "cascade" }),
  sentenceId: integer("sentence_id").notNull().references(() => textSentences.id, { onDelete: "cascade" }),
  studentSentence: text("student_sentence").notNull(),
  earnedScore: integer("earned_score").notNull().default(0),
  feedback: text("feedback"),
});

// Insert schemas
export const insertExamSchema = createInsertSchema(exams).omit({ id: true, createdAt: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertSubmissionSchema = createInsertSchema(studentSubmissions).omit({ id: true, submittedAt: true, totalScore: true });
export const insertAnswerDetailSchema = createInsertSchema(answerDetails).omit({ id: true });

// Types
export type InsertExam = z.infer<typeof insertExamSchema>;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type InsertAnswerDetail = z.infer<typeof insertAnswerDetailSchema>;

export type Exam = typeof exams.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type StudentSubmission = typeof studentSubmissions.$inferSelect;
export type AnswerDetail = typeof answerDetails.$inferSelect;

// Extended types for API responses
export type ExamWithQuestions = Exam & { questions: Question[] };
export type SubmissionWithDetails = StudentSubmission & { answers: AnswerDetail[] };

export const insertTextSubmissionSchema = createInsertSchema(textSubmissions).omit({ id: true, submittedAt: true });
export const insertTextSentenceSchema = createInsertSchema(textSentences).omit({ id: true });
export const insertTextAnswerDetailSchema = createInsertSchema(textAnswerDetails).omit({ id: true });

export type InsertTextSubmission = z.infer<typeof insertTextSubmissionSchema>;
export type InsertTextSentence = z.infer<typeof insertTextSentenceSchema>;
export type InsertTextAnswerDetail = z.infer<typeof insertTextAnswerDetailSchema>;

export type TextSubmission = typeof textSubmissions.$inferSelect;
export type TextSentence = typeof textSentences.$inferSelect;
export type TextAnswerDetail = typeof textAnswerDetails.$inferSelect;

export type ExamWithSentences = Exam & { sentences: TextSentence[] };
export type TextSubmissionWithDetails = TextSubmission & { answers: TextAnswerDetail[] };

// Form validation schemas
export const studentLoginSchema = z.object({
  studentName: z.string().min(1, "Name is required"),
  studentNumber: z.number().min(1).max(40),
  originalClass: z.enum(["J3A", "J3B", "J3C"]),
  mixedClass: z.enum(["初三英文1班", "初三英文2班", "初三英文3班"]),
});

export const examSubmissionSchema = z.object({
  examId: z.number(),
  studentName: z.string(),
  studentNumber: z.number(),
  originalClass: z.string(),
  mixedClass: z.string(),
  answers: z.array(z.object({
    questionId: z.number(),
    studentWord: z.string(),
    studentPos: z.string(),
    studentMeaning: z.string(),
  })),
});

export const createExamSchema = z.object({
  title: z.string().min(1, "Title is required"),
  vocabularies: z.string().min(1, "At least one vocabulary entry is required"),
});

export type StudentLogin = z.infer<typeof studentLoginSchema>;
export type ExamSubmission = z.infer<typeof examSubmissionSchema>;
export type CreateExam = z.infer<typeof createExamSchema>;

// Chat integration types (for OpenAI voice chat)
export const conversations = pgTable("conversations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

// Answer Sheet Sessions for Quick Answer Sheet Builder
export const answerSheetSessions = pgTable("answer_sheet_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  paperLink: text("paper_link").notNull(),
  itemsJson: text("items_json").notNull(), // JSON string of QuestionItem[]
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// QuestionItem interface for the items_json field
export interface QuestionItem {
  id: number; // Question Number
  type: 'mc' | 'text';
  correct: string;
  options?: string[]; // e.g. ['A','B','C','D'] for MC
}

export const answerSheetSubmissions = pgTable("answer_sheet_submissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sessionId: integer("session_id").notNull().references(() => answerSheetSessions.id, { onDelete: "cascade" }),
  studentName: text("student_name").notNull(),
  studentNumber: integer("student_number").notNull(),
  originalClass: text("original_class").notNull(),
  answersJson: text("answers_json").notNull(), // JSON string of student answers
  totalScore: integer("total_score").notNull(),
  maxScore: integer("max_score").notNull(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const insertAnswerSheetSessionSchema = createInsertSchema(answerSheetSessions).omit({ id: true, createdAt: true });
export const insertAnswerSheetSubmissionSchema = createInsertSchema(answerSheetSubmissions).omit({ id: true, submittedAt: true });

export type InsertAnswerSheetSession = z.infer<typeof insertAnswerSheetSessionSchema>;
export type InsertAnswerSheetSubmission = z.infer<typeof insertAnswerSheetSubmissionSchema>;
export type AnswerSheetSession = typeof answerSheetSessions.$inferSelect;
export type AnswerSheetSubmission = typeof answerSheetSubmissions.$inferSelect;
