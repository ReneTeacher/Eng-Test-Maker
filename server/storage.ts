import { 
  exams, questions, studentSubmissions, answerDetails,
  type Exam, type Question, type StudentSubmission, type AnswerDetail,
  type InsertExam, type InsertQuestion, type InsertSubmission, type InsertAnswerDetail,
  type ExamWithQuestions
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Exams
  createExam(exam: InsertExam): Promise<Exam>;
  getExams(): Promise<Exam[]>;
  getExamById(id: number): Promise<Exam | undefined>;
  getActiveExam(): Promise<ExamWithQuestions | undefined>;
  updateExam(id: number, data: Partial<InsertExam>): Promise<Exam | undefined>;
  deleteExam(id: number): Promise<boolean>;
  deactivateAllExams(): Promise<void>;

  // Questions
  createQuestions(questions: InsertQuestion[]): Promise<Question[]>;
  getQuestionsByExamId(examId: number): Promise<Question[]>;

  // Submissions
  createSubmission(submission: InsertSubmission & { totalScore: number }): Promise<StudentSubmission>;
  getSubmissions(): Promise<StudentSubmission[]>;
  getSubmissionsByExamId(examId: number): Promise<StudentSubmission[]>;

  // Answer Details
  createAnswerDetails(details: InsertAnswerDetail[]): Promise<AnswerDetail[]>;
  getAnswerDetailsBySubmissionId(submissionId: number): Promise<AnswerDetail[]>;
  getAnswerDetailsByExamId(examId: number): Promise<(AnswerDetail & { submissionId: number })[]>;
}

export class DatabaseStorage implements IStorage {
  // Exams
  async createExam(exam: InsertExam): Promise<Exam> {
    const [created] = await db.insert(exams).values(exam).returning();
    return created;
  }

  async getExams(): Promise<Exam[]> {
    return db.select().from(exams).orderBy(desc(exams.createdAt));
  }

  async getExamById(id: number): Promise<Exam | undefined> {
    const [exam] = await db.select().from(exams).where(eq(exams.id, id));
    return exam;
  }

  async getActiveExam(): Promise<ExamWithQuestions | undefined> {
    const [exam] = await db.select().from(exams).where(eq(exams.isActive, true));
    if (!exam) return undefined;
    
    const questionList = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, exam.id))
      .orderBy(questions.wordOrder);
    
    return { ...exam, questions: questionList };
  }

  async updateExam(id: number, data: Partial<InsertExam>): Promise<Exam | undefined> {
    const [updated] = await db.update(exams).set(data).where(eq(exams.id, id)).returning();
    return updated;
  }

  async deleteExam(id: number): Promise<boolean> {
    const result = await db.delete(exams).where(eq(exams.id, id)).returning();
    return result.length > 0;
  }

  async deactivateAllExams(): Promise<void> {
    await db.update(exams).set({ isActive: false });
  }

  // Questions
  async createQuestions(questionList: InsertQuestion[]): Promise<Question[]> {
    if (questionList.length === 0) return [];
    return db.insert(questions).values(questionList).returning();
  }

  async getQuestionsByExamId(examId: number): Promise<Question[]> {
    return db.select().from(questions).where(eq(questions.examId, examId)).orderBy(questions.wordOrder);
  }

  // Submissions
  async createSubmission(submission: InsertSubmission & { totalScore: number }): Promise<StudentSubmission> {
    const [created] = await db.insert(studentSubmissions).values(submission).returning();
    return created;
  }

  async getSubmissions(): Promise<StudentSubmission[]> {
    return db.select().from(studentSubmissions).orderBy(desc(studentSubmissions.submittedAt));
  }

  async getSubmissionsByExamId(examId: number): Promise<StudentSubmission[]> {
    return db
      .select()
      .from(studentSubmissions)
      .where(eq(studentSubmissions.examId, examId))
      .orderBy(desc(studentSubmissions.submittedAt));
  }

  // Answer Details
  async createAnswerDetails(details: InsertAnswerDetail[]): Promise<AnswerDetail[]> {
    if (details.length === 0) return [];
    return db.insert(answerDetails).values(details).returning();
  }

  async getAnswerDetailsBySubmissionId(submissionId: number): Promise<AnswerDetail[]> {
    return db.select().from(answerDetails).where(eq(answerDetails.submissionId, submissionId));
  }

  async getAnswerDetailsByExamId(examId: number): Promise<(AnswerDetail & { submissionId: number })[]> {
    const subs = await this.getSubmissionsByExamId(examId);
    const allDetails: (AnswerDetail & { submissionId: number })[] = [];
    
    for (const sub of subs) {
      const details = await this.getAnswerDetailsBySubmissionId(sub.id);
      allDetails.push(...details.map(d => ({ ...d, submissionId: sub.id })));
    }
    
    return allDetails;
  }
}

export const storage = new DatabaseStorage();
