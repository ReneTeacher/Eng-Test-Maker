import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const exams = pgTable("exams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const questions = pgTable("questions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  wordOrder: integer("word_order").notNull(),
  correctWord: text("correct_word").notNull(),
  correctPos: text("correct_pos").notNull(),
  correctMeaning: text("correct_meaning").notNull(),
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

// Remove old user types
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
