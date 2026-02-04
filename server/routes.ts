import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { examSubmissionSchema, createExamSchema } from "@shared/schema";
import * as XLSX from "xlsx";

const ADMIN_PASSWORD = "teacher123";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Admin login
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { password } = req.body;
      if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
      } else {
        res.status(401).json({ message: "Invalid password" });
      }
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Get all exams
  app.get("/api/exams", async (req, res) => {
    try {
      const exams = await storage.getExams();
      res.json(exams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exams" });
    }
  });

  // Get active exam with questions
  app.get("/api/exams/active", async (req, res) => {
    try {
      const exam = await storage.getActiveExam();
      if (!exam) {
        res.status(404).json({ message: "No active exam" });
        return;
      }
      res.json(exam);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active exam" });
    }
  });

  // Create exam
  app.post("/api/exams", async (req, res) => {
    try {
      const parsed = createExamSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid exam data" });
        return;
      }

      const { title, words, isActive } = { ...parsed.data, isActive: req.body.isActive ?? false };
      
      // Parse words from newline-separated string
      const wordList = words
        .split("\n")
        .map((w: string) => w.trim())
        .filter((w: string) => w.length > 0);

      if (wordList.length === 0) {
        res.status(400).json({ message: "At least one word is required" });
        return;
      }

      // If setting as active, deactivate all others first
      if (isActive) {
        await storage.deactivateAllExams();
      }

      // Create exam
      const exam = await storage.createExam({ title, isActive });

      // Create questions
      const questionData = wordList.map((word: string, index: number) => ({
        examId: exam.id,
        wordOrder: index + 1,
        correctAnswer: word,
      }));
      await storage.createQuestions(questionData);

      res.json(exam);
    } catch (error) {
      console.error("Create exam error:", error);
      res.status(500).json({ message: "Failed to create exam" });
    }
  });

  // Update exam (toggle active status)
  app.patch("/api/exams/:id", async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const { isActive } = req.body;

      if (typeof isActive === "boolean") {
        // If activating this exam, deactivate all others first
        if (isActive) {
          await storage.deactivateAllExams();
        }
        const updated = await storage.updateExam(examId, { isActive });
        res.json(updated);
      } else {
        res.status(400).json({ message: "Invalid update data" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to update exam" });
    }
  });

  // Delete exam
  app.delete("/api/exams/:id", async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      await storage.deleteExam(examId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete exam" });
    }
  });

  // Get all submissions
  app.get("/api/submissions", async (req, res) => {
    try {
      const submissions = await storage.getSubmissions();
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // Submit exam answers
  app.post("/api/submissions", async (req, res) => {
    try {
      const parsed = examSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid submission data" });
        return;
      }

      const { examId, studentName, studentNumber, originalClass, mixedClass, answers } = parsed.data;

      // Get exam questions to compare answers
      const questions = await storage.getQuestionsByExamId(examId);
      
      // Calculate score (case-insensitive comparison)
      let totalScore = 0;
      const answerDetails: { questionId: number; studentAnswer: string; isCorrect: boolean }[] = [];

      for (const answer of answers) {
        const question = questions.find(q => q.id === answer.questionId);
        if (question) {
          const isCorrect = answer.studentAnswer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
          if (isCorrect) totalScore++;
          answerDetails.push({
            questionId: answer.questionId,
            studentAnswer: answer.studentAnswer,
            isCorrect,
          });
        }
      }

      // Create submission
      const submission = await storage.createSubmission({
        examId,
        studentName,
        studentNumber,
        originalClass,
        mixedClass,
        totalScore,
      });

      // Create answer details
      await storage.createAnswerDetails(
        answerDetails.map(d => ({
          submissionId: submission.id,
          questionId: d.questionId,
          studentAnswer: d.studentAnswer,
          isCorrect: d.isCorrect,
        }))
      );

      res.json({ 
        totalScore, 
        totalQuestions: questions.length,
        studentName 
      });
    } catch (error) {
      console.error("Submission error:", error);
      res.status(500).json({ message: "Failed to submit answers" });
    }
  });

  // Export to Excel
  app.get("/api/export", async (req, res) => {
    try {
      const examId = req.query.examId ? parseInt(req.query.examId as string) : undefined;
      
      let submissions;
      let questions;
      let exam;

      if (examId) {
        exam = await storage.getExamById(examId);
        submissions = await storage.getSubmissionsByExamId(examId);
        questions = await storage.getQuestionsByExamId(examId);
      } else {
        // Get active exam
        const activeExam = await storage.getActiveExam();
        if (!activeExam) {
          res.status(404).json({ message: "No active exam" });
          return;
        }
        exam = activeExam;
        submissions = await storage.getSubmissionsByExamId(activeExam.id);
        questions = activeExam.questions;
      }

      if (!exam) {
        res.status(404).json({ message: "Exam not found" });
        return;
      }

      // Build Excel data
      const headers = [
        "Name",
        "Student Number",
        "Original Class",
        "Mixed Class",
        ...questions.sort((a, b) => a.wordOrder - b.wordOrder).map((_, i) => `Q${i + 1}_Answer`),
        "Total Score",
        "Timestamp"
      ];

      const rows = await Promise.all(submissions.map(async (sub) => {
        const answers = await storage.getAnswerDetailsBySubmissionId(sub.id);
        const answerMap = new Map(answers.map(a => [a.questionId, a.studentAnswer]));
        
        return [
          sub.studentName,
          sub.studentNumber,
          sub.originalClass,
          sub.mixedClass,
          ...questions.sort((a, b) => a.wordOrder - b.wordOrder).map(q => answerMap.get(q.id) || ""),
          sub.totalScore,
          new Date(sub.submittedAt).toLocaleString()
        ];
      }));

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      
      // Set column widths
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length, 15) }));
      
      XLSX.utils.book_append_sheet(wb, ws, exam.title.substring(0, 31));

      // Generate buffer
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${exam.title}-results.xlsx"`);
      res.send(buffer);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  return httpServer;
}
