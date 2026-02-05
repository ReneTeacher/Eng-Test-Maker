import { 
  exams, questions, studentSubmissions, answerDetails, textSubmissions, textSentences, textAnswerDetails,
  answerSheetSessions, answerSheetSubmissions,
  type Exam, type Question, type StudentSubmission, type AnswerDetail, type TextSubmission, type TextSentence, type TextAnswerDetail,
  type InsertExam, type InsertQuestion, type InsertSubmission, type InsertAnswerDetail, type InsertTextSentence, type InsertTextAnswerDetail,
  type ExamWithQuestions, type ExamWithSentences,
  type AnswerSheetSession, type AnswerSheetSubmission, type InsertAnswerSheetSession, type InsertAnswerSheetSubmission
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
  deleteQuestionsByExamId(examId: number): Promise<void>;

  // Submissions
  createSubmission(submission: InsertSubmission & { totalScore: number }): Promise<StudentSubmission>;
  getSubmissions(): Promise<StudentSubmission[]>;
  getSubmissionsByExamId(examId: number): Promise<StudentSubmission[]>;
  updateSubmissionScore(id: number, score: number): Promise<void>;

  // Answer Details
  createAnswerDetails(details: InsertAnswerDetail[]): Promise<AnswerDetail[]>;
  getAnswerDetailsBySubmissionId(submissionId: number): Promise<AnswerDetail[]>;
  getAnswerDetailsByExamId(examId: number): Promise<(AnswerDetail & { submissionId: number })[]>;
  updateAnswerDetail(id: number, data: Partial<AnswerDetail>): Promise<void>;

  // Text Submissions
  createTextSubmission(data: {
    examId: number;
    studentName: string;
    studentNumber: number;
    originalClass: string;
    mixedClass: string;
    studentText: string;
    totalScore: number;
    maxScore?: number;
    feedback?: string;
  }): Promise<TextSubmission>;
  getTextSubmissionsByExamId(examId: number): Promise<TextSubmission[]>;

  // Text Sentences
  createTextSentences(sentences: InsertTextSentence[]): Promise<TextSentence[]>;
  getTextSentencesByExamId(examId: number): Promise<TextSentence[]>;
  deleteTextSentencesByExamId(examId: number): Promise<void>;
  getActiveTextExam(): Promise<ExamWithSentences | undefined>;

  // Text Answer Details
  createTextAnswerDetails(details: InsertTextAnswerDetail[]): Promise<TextAnswerDetail[]>;
  getTextAnswerDetailsBySubmissionId(submissionId: number): Promise<TextAnswerDetail[]>;
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
    // Only return vocab exams (not text exams)
    const allActive = await db.select().from(exams).where(eq(exams.isActive, true));
    const exam = allActive.find(e => e.examType === "vocab");
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

  async deleteQuestionsByExamId(examId: number): Promise<void> {
    await db.delete(questions).where(eq(questions.examId, examId));
  }

  // Submissions
  async createSubmission(submission: InsertSubmission & { totalScore: number }): Promise<StudentSubmission> {
    const [created] = await db.insert(studentSubmissions).values({
      examId: submission.examId,
      studentName: submission.studentName,
      studentNumber: submission.studentNumber,
      originalClass: submission.originalClass,
      mixedClass: submission.mixedClass,
      totalScore: submission.totalScore,
    }).returning();
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

  async updateSubmissionScore(id: number, score: number): Promise<void> {
    await db.update(studentSubmissions).set({ totalScore: score }).where(eq(studentSubmissions.id, id));
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

  async updateAnswerDetail(id: number, data: Partial<AnswerDetail>): Promise<void> {
    await db.update(answerDetails).set(data).where(eq(answerDetails.id, id));
  }

  // Text Submissions
  async createTextSubmission(data: {
    examId: number;
    studentName: string;
    studentNumber: number;
    originalClass: string;
    mixedClass: string;
    studentText: string;
    totalScore: number;
    maxScore?: number;
    feedback?: string;
  }): Promise<TextSubmission> {
    const [created] = await db.insert(textSubmissions).values({
      ...data,
      maxScore: data.maxScore ?? 100,
    }).returning();
    return created;
  }

  async getTextSubmissionsByExamId(examId: number): Promise<TextSubmission[]> {
    return db
      .select()
      .from(textSubmissions)
      .where(eq(textSubmissions.examId, examId))
      .orderBy(desc(textSubmissions.submittedAt));
  }

  // Text Sentences
  async createTextSentences(sentenceList: InsertTextSentence[]): Promise<TextSentence[]> {
    if (sentenceList.length === 0) return [];
    return db.insert(textSentences).values(sentenceList).returning();
  }

  async getTextSentencesByExamId(examId: number): Promise<TextSentence[]> {
    return db.select().from(textSentences).where(eq(textSentences.examId, examId)).orderBy(textSentences.sentenceOrder);
  }

  async deleteTextSentencesByExamId(examId: number): Promise<void> {
    await db.delete(textSentences).where(eq(textSentences.examId, examId));
  }

  async getActiveTextExam(): Promise<ExamWithSentences | undefined> {
    const [exam] = await db.select().from(exams).where(eq(exams.isActive, true));
    if (!exam || exam.examType !== "text") return undefined;
    
    const sentenceList = await db
      .select()
      .from(textSentences)
      .where(eq(textSentences.examId, exam.id))
      .orderBy(textSentences.sentenceOrder);
    
    return { ...exam, sentences: sentenceList };
  }

  // Text Answer Details
  async createTextAnswerDetails(details: InsertTextAnswerDetail[]): Promise<TextAnswerDetail[]> {
    if (details.length === 0) return [];
    return db.insert(textAnswerDetails).values(details).returning();
  }

  async getTextAnswerDetailsBySubmissionId(submissionId: number): Promise<TextAnswerDetail[]> {
    return db.select().from(textAnswerDetails).where(eq(textAnswerDetails.submissionId, submissionId));
  }

  // Get all text submissions
  async getTextSubmissions(): Promise<TextSubmission[]> {
    return db.select().from(textSubmissions).orderBy(desc(textSubmissions.submittedAt));
  }

  // Get submission with details
  async getSubmissionWithDetails(submissionId: number): Promise<(StudentSubmission & { answers: AnswerDetail[] }) | undefined> {
    const [submission] = await db.select().from(studentSubmissions).where(eq(studentSubmissions.id, submissionId));
    if (!submission) return undefined;
    
    const answers = await this.getAnswerDetailsBySubmissionId(submissionId);
    return { ...submission, answers };
  }

  // Get text submission with details
  async getTextSubmissionWithDetails(submissionId: number): Promise<(TextSubmission & { answers: TextAnswerDetail[] }) | undefined> {
    const [submission] = await db.select().from(textSubmissions).where(eq(textSubmissions.id, submissionId));
    if (!submission) return undefined;
    
    const answers = await this.getTextAnswerDetailsBySubmissionId(submissionId);
    return { ...submission, answers };
  }

  // Update text submission score
  async updateTextSubmissionScore(id: number, score: number): Promise<void> {
    await db.update(textSubmissions).set({ totalScore: score }).where(eq(textSubmissions.id, id));
  }

  // Update text answer detail
  async updateTextAnswerDetail(id: number, data: Partial<TextAnswerDetail>): Promise<void> {
    await db.update(textAnswerDetails).set(data).where(eq(textAnswerDetails.id, id));
  }

  // Answer Sheet Sessions
  async createAnswerSheetSession(session: InsertAnswerSheetSession): Promise<AnswerSheetSession> {
    const [created] = await db.insert(answerSheetSessions).values(session).returning();
    return created;
  }

  async getAnswerSheetSessions(): Promise<AnswerSheetSession[]> {
    return db.select().from(answerSheetSessions).orderBy(desc(answerSheetSessions.createdAt));
  }

  async getAnswerSheetSessionById(id: number): Promise<AnswerSheetSession | undefined> {
    const [session] = await db.select().from(answerSheetSessions).where(eq(answerSheetSessions.id, id));
    return session;
  }

  async updateAnswerSheetSession(id: number, data: Partial<InsertAnswerSheetSession>): Promise<AnswerSheetSession | undefined> {
    const [updated] = await db.update(answerSheetSessions).set(data).where(eq(answerSheetSessions.id, id)).returning();
    return updated;
  }

  async deleteAnswerSheetSession(id: number): Promise<boolean> {
    const result = await db.delete(answerSheetSessions).where(eq(answerSheetSessions.id, id)).returning();
    return result.length > 0;
  }

  // Answer Sheet Submissions
  async createAnswerSheetSubmission(submission: InsertAnswerSheetSubmission): Promise<AnswerSheetSubmission> {
    const [created] = await db.insert(answerSheetSubmissions).values(submission).returning();
    return created;
  }

  async getAnswerSheetSubmissionsBySessionId(sessionId: number): Promise<AnswerSheetSubmission[]> {
    return db.select().from(answerSheetSubmissions).where(eq(answerSheetSubmissions.sessionId, sessionId)).orderBy(desc(answerSheetSubmissions.submittedAt));
  }
}

export const storage = new DatabaseStorage();
