import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { examSubmissionSchema, createExamSchema } from "@shared/schema";
import ExcelJS from "exceljs";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

      const { title, vocabularies, isActive } = { ...parsed.data, isActive: req.body.isActive ?? false };
      
      // Parse vocabularies from newline-separated string with format: Word | POS | Meaning
      const vocabLines = vocabularies
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);

      if (vocabLines.length === 0) {
        res.status(400).json({ message: "At least one vocabulary entry is required" });
        return;
      }

      // Parse each line into word, pos, meaning
      const parsedVocabs: { word: string; pos: string; meaning: string }[] = [];
      for (let i = 0; i < vocabLines.length; i++) {
        const parts = vocabLines[i].split("|").map((p: string) => p.trim());
        if (parts.length !== 3) {
          res.status(400).json({ 
            message: `Line ${i + 1} is invalid. Expected format: Word | POS | Meaning` 
          });
          return;
        }
        const [word, pos, meaning] = parts;
        if (!word || !pos || !meaning) {
          res.status(400).json({ 
            message: `Line ${i + 1} has empty fields. All three parts are required.` 
          });
          return;
        }
        parsedVocabs.push({ word, pos, meaning });
      }

      // If setting as active, deactivate all others first
      if (isActive) {
        await storage.deactivateAllExams();
      }

      // Create exam
      const exam = await storage.createExam({ title, isActive });

      // Create questions
      const questionData = parsedVocabs.map((vocab, index) => ({
        examId: exam.id,
        wordOrder: index + 1,
        correctWord: vocab.word,
        correctPos: vocab.pos,
        correctMeaning: vocab.meaning,
      }));
      await storage.createQuestions(questionData);

      res.json(exam);
    } catch (error) {
      console.error("Create exam error:", error);
      res.status(500).json({ message: "Failed to create exam" });
    }
  });

  // Update exam (toggle active status and now full edit)
  app.patch("/api/exams/:id", async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const { isActive, title, vocabularies } = req.body;

      if (typeof isActive === "boolean" && !title && !vocabularies) {
        // Simple toggle
        if (isActive) {
          await storage.deactivateAllExams();
        }
        const updated = await storage.updateExam(examId, { isActive });
        res.json(updated);
        return;
      }

      // Full update
      if (title && vocabularies) {
        const vocabLines = vocabularies
          .split("\n")
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0);

        if (vocabLines.length === 0) {
          res.status(400).json({ message: "At least one vocabulary entry is required" });
          return;
        }

        const parsedVocabs: { word: string; pos: string; meaning: string }[] = [];
        for (let i = 0; i < vocabLines.length; i++) {
          const parts = vocabLines[i].split("|").map((p: string) => p.trim());
          if (parts.length !== 3) {
            res.status(400).json({ message: `Line ${i + 1} is invalid. Expected format: Word | POS | Meaning` });
            return;
          }
          parsedVocabs.push({ word: parts[0], pos: parts[1], meaning: parts[2] });
        }

        if (isActive) {
          await storage.deactivateAllExams();
        }

        const updated = await storage.updateExam(examId, { title, isActive: isActive ?? false });
        
        // Remove old questions and create new ones
        // In a real app we might want to map existing questions, but replacing is simpler for this format
        await storage.deleteQuestionsByExamId(examId);
        const questionData = parsedVocabs.map((vocab, index) => ({
          examId,
          wordOrder: index + 1,
          correctWord: vocab.word,
          correctPos: vocab.pos,
          correctMeaning: vocab.meaning,
        }));
        await storage.createQuestions(questionData);

        // RE-CALCULATE SCORES for all submissions of this exam
        const submissions = await storage.getSubmissionsByExamId(examId);
        const questions = await storage.getQuestionsByExamId(examId);

        for (const sub of submissions) {
          const answers = await storage.getAnswerDetailsBySubmissionId(sub.id);
          let newTotalScore = 0;

          for (const answer of answers) {
            const question = questions.find(q => q.id === answer.questionId);
            if (question) {
              const studentWord = answer.studentWord.trim().toLowerCase();
              const studentPos = answer.studentPos.trim().toLowerCase();
              const studentMeaning = answer.studentMeaning.trim();

              const correctWords = question.correctWord.split(/[,/]/).map(w => w.trim().toLowerCase());
              const correctPosList = question.correctPos.split(/[,/]/).map(p => p.trim().toLowerCase());
              const correctMeanings = question.correctMeaning.split(/[,/]/).map(m => m.trim());

              const isCorrect = correctWords.includes(studentWord) && 
                               correctPosList.includes(studentPos) && 
                               correctMeanings.includes(studentMeaning);
              
              if (isCorrect) newTotalScore++;
              
              // Update individual answer correctness
              await storage.updateAnswerDetail(answer.id, { isCorrect });
            }
          }

          // Update submission total score
          await storage.updateSubmissionScore(sub.id, newTotalScore);
        }

        res.json(updated);
      } else {
        res.status(400).json({ message: "Invalid update data" });
      }
    } catch (error) {
      console.error("Update exam error:", error);
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

  // Get single exam with questions
  app.get("/api/exams/:id", async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const exam = await storage.getExamById(examId);
      if (!exam) {
        res.status(404).json({ message: "Exam not found" });
        return;
      }
      const questions = await storage.getQuestionsByExamId(examId);
      res.json({ ...exam, questions });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exam" });
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
      
      // Calculate score: ALL 3 parts must match
      // - English word and POS: case-insensitive
      // - Chinese meaning: strict match (exact)
      let totalScore = 0;
      const answerDetailsList: { 
        questionId: number; 
        studentWord: string;
        studentPos: string;
        studentMeaning: string;
        isCorrect: boolean 
      }[] = [];

      for (const answer of answers) {
        const question = questions.find(q => q.id === answer.questionId);
        if (question) {
          const studentWord = answer.studentWord.trim().toLowerCase();
          const studentPos = answer.studentPos.trim().toLowerCase();
          const studentMeaning = answer.studentMeaning.trim();

          // Split correct answers by comma or slash
          const correctWords = question.correctWord.split(/[,/]/).map(w => w.trim().toLowerCase());
          const correctPosList = question.correctPos.split(/[,/]/).map(p => p.trim().toLowerCase());
          const correctMeanings = question.correctMeaning.split(/[,/]/).map(m => m.trim());

          const wordMatch = correctWords.includes(studentWord);
          const posMatch = correctPosList.includes(studentPos);
          const meaningMatch = correctMeanings.includes(studentMeaning);
          
          const isCorrect = wordMatch && posMatch && meaningMatch;
          if (isCorrect) totalScore++;
          
          answerDetailsList.push({
            questionId: answer.questionId,
            studentWord: answer.studentWord,
            studentPos: answer.studentPos,
            studentMeaning: answer.studentMeaning,
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
        answerDetailsList.map(d => ({
          submissionId: submission.id,
          questionId: d.questionId,
          studentWord: d.studentWord,
          studentPos: d.studentPos,
          studentMeaning: d.studentMeaning,
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

      // Sort questions once for consistency
      const sortedQuestions = [...questions].sort((a, b) => a.wordOrder - b.wordOrder);
      
      // Build Excel data with 6 columns per question:
      // Student Word, Student POS, Student Meaning, Correct Word, Correct POS, Correct Meaning
      const questionHeaders: string[] = [];
      sortedQuestions.forEach((_, i) => {
        questionHeaders.push(
          `Q${i + 1}_StudentWord`,
          `Q${i + 1}_StudentPOS`,
          `Q${i + 1}_StudentMeaning`,
          `Q${i + 1}_CorrectWord`,
          `Q${i + 1}_CorrectPOS`,
          `Q${i + 1}_CorrectMeaning`,
          `Q${i + 1}_Correct`
        );
      });

      const headers = [
        "Name",
        "Student Number",
        "Original Class",
        "Mixed Class",
        ...questionHeaders,
        "Total Score",
        "Timestamp"
      ];

      const rows = await Promise.all(submissions.map(async (sub) => {
        const answers = await storage.getAnswerDetailsBySubmissionId(sub.id);
        const answerMap = new Map(answers.map(a => [a.questionId, a]));
        
        const questionData: (string | boolean)[] = [];
        for (const q of sortedQuestions) {
          const answer = answerMap.get(q.id);
          questionData.push(
            answer?.studentWord || "",
            answer?.studentPos || "",
            answer?.studentMeaning || "",
            q.correctWord,
            q.correctPos,
            q.correctMeaning,
            answer?.isCorrect ? "Yes" : "No"
          );
        }

        return [
          sub.studentName,
          sub.studentNumber,
          sub.originalClass,
          sub.mixedClass,
          ...questionData,
          sub.totalScore,
          new Date(sub.submittedAt).toLocaleString()
        ];
      }));

      // Create workbook using exceljs
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(exam.title.substring(0, 31));
      
      // Add header row
      worksheet.addRow(headers);
      
      // Add data rows
      rows.forEach(row => worksheet.addRow(row));
      
      // Set column widths
      worksheet.columns = headers.map((h) => ({ width: Math.max(h.length, 15) }));

      // Generate buffer and convert to Node Buffer for consistent binary delivery
      const arrayBuffer = await workbook.xlsx.writeBuffer();
      const buffer = Buffer.from(arrayBuffer);

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
