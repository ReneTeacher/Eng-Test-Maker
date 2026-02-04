import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { examSubmissionSchema, createExamSchema } from "@shared/schema";
import ExcelJS from "exceljs";
import OpenAI from "openai";

// Poe API client for AI scoring
const poeClient = new OpenAI({
  apiKey: process.env.POE_API_KEY,
  baseURL: "https://api.poe.com/bot/v1",
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Helper function to normalize Chinese text for comparison
function normalizeChinese(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '') // Remove all whitespace
    .replace(/，/g, ',') // Full-width comma to half-width
    .replace(/。/g, '.') // Full-width period to half-width
    .replace(/！/g, '!') // Full-width exclamation
    .replace(/？/g, '?') // Full-width question mark
    .replace(/：/g, ':') // Full-width colon
    .replace(/；/g, ';') // Full-width semicolon
    .replace(/（/g, '(') // Full-width parentheses
    .replace(/）/g, ')')
    .replace(/「/g, '"') // Chinese quotation marks
    .replace(/」/g, '"')
    .replace(/『/g, "'")
    .replace(/』/g, "'")
    .replace(/《/g, '<')
    .replace(/》/g, '>')
    .replace(/【/g, '[')
    .replace(/】/g, ']');
}

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

  // Get active exam with questions or sentences
  app.get("/api/exams/active", async (req, res) => {
    try {
      const vocabExam = await storage.getActiveExam();
      if (vocabExam) {
        res.json(vocabExam);
        return;
      }
      
      // Check for text dictation exam
      const textExam = await storage.getActiveTextExam();
      if (textExam) {
        res.json(textExam);
        return;
      }
      
      res.status(404).json({ message: "No active exam" });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active exam" });
    }
  });

  // Create exam
  app.post("/api/exams", async (req, res) => {
    try {
      const { title, vocabularies, correctText, isActive, examType } = req.body;
      
      if (!title || typeof title !== "string" || !title.trim()) {
        res.status(400).json({ message: "Title is required" });
        return;
      }

      const type = examType === "text" ? "text" : "vocab";

      if (type === "text") {
        // Text Dictation exam
        if (!correctText || typeof correctText !== "string" || !correctText.trim()) {
          res.status(400).json({ message: "Correct text is required for text dictation" });
          return;
        }

        // Split text into sentences using common punctuation
        const sentences = correctText.trim()
          .split(/(?<=[.!?。！？])\s*/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);

        if (sentences.length === 0) {
          res.status(400).json({ message: "Could not parse any sentences from the text" });
          return;
        }

        const exam = await storage.createExam({ 
          title: title.trim(), 
          isActive: isActive ?? false,
          examType: "text",
          correctText: correctText.trim()
        });

        // Create sentence records (distributed points to total 100)
        const totalPoints = 100;
        const sentencesParsed = sentences.length;
        const pointsPerSentence = Math.floor(totalPoints / sentencesParsed);
        const remainder = totalPoints % sentencesParsed;

        const sentenceData = sentences.map((sentence: string, index: number) => ({
          examId: exam.id,
          sentenceOrder: index + 1,
          correctSentence: sentence,
          maxScore: pointsPerSentence + (index < remainder ? 1 : 0),
        }));
        await storage.createTextSentences(sentenceData);

        // Return exam with sentences
        const sentenceList = await storage.getTextSentencesByExamId(exam.id);
        res.json({ ...exam, sentences: sentenceList });
      } else {
        // Vocab Quiz exam
        if (!vocabularies || typeof vocabularies !== "string") {
          res.status(400).json({ message: "Vocabularies are required" });
          return;
        }

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

        // Create exam
        const exam = await storage.createExam({ 
          title: title.trim(), 
          isActive: isActive ?? false,
          examType: "vocab"
        });

        // Create questions
        const totalPoints = 100;
        const pointsPerQuestion = Math.floor(totalPoints / parsedVocabs.length);
        const remainder = totalPoints % parsedVocabs.length;

        const questionData = parsedVocabs.map((vocab, index) => {
          const qTotal = pointsPerQuestion + (index < remainder ? 1 : 0);
          // Distribute question points: Word(50%), POS(25%), Meaning(25%)
          const wordScore = Math.floor(qTotal * 0.5);
          const posScore = Math.floor(qTotal * 0.25);
          const meaningScore = qTotal - wordScore - posScore;

          return {
            examId: exam.id,
            wordOrder: index + 1,
            correctWord: vocab.word,
            correctPos: vocab.pos,
            correctMeaning: vocab.meaning,
            wordScore,
            posScore,
            meaningScore,
          };
        });
        await storage.createQuestions(questionData);

        res.json(exam);
      }
    } catch (error) {
      console.error("Create exam error:", error);
      res.status(500).json({ message: "Failed to create exam" });
    }
  });

  // Update exam (toggle active status and now full edit)
  app.patch("/api/exams/:id", async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const { isActive, title, vocabularies, correctText, examType } = req.body;

      // Get current exam to check its type
      const currentExam = await storage.getExamById(examId);
      if (!currentExam) {
        res.status(404).json({ message: "Exam not found" });
        return;
      }

      if (typeof isActive === "boolean" && !title && !vocabularies && !correctText) {
        // Simple toggle - no longer deactivates others, multiple exams can be active
        const updated = await storage.updateExam(examId, { isActive });
        res.json(updated);
        return;
      }

      // Full update for Text Dictation
      if (currentExam.examType === "text" && title && correctText) {
        const updated = await storage.updateExam(examId, { 
          title, 
          isActive: isActive ?? currentExam.isActive,
          correctText 
        });

        // Split text into sentences and redistribute 100 points
        const sentences = correctText.trim()
          .split(/(?<=[.!?。！？])\s*/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);

        if (sentences.length > 0) {
          await storage.deleteTextSentencesByExamId(examId);
          const totalPoints = 100;
          const pointsPerSentence = Math.floor(totalPoints / sentences.length);
          const remainder = totalPoints % sentences.length;

          const sentenceData = sentences.map((sentence: string, index: number) => ({
            examId,
            sentenceOrder: index + 1,
            correctSentence: sentence,
            maxScore: pointsPerSentence + (index < remainder ? 1 : 0),
          }));
          await storage.createTextSentences(sentenceData);
        }

        res.json(updated);
        return;
      }

      // Full update for Vocab Quiz
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

        const updated = await storage.updateExam(examId, { title, isActive: isActive ?? currentExam.isActive });
        
        // Remove old questions and create new ones
        // In a real app we might want to map existing questions, but replacing is simpler for this format
        await storage.deleteQuestionsByExamId(examId);
        const totalPoints = 100;
        const pointsPerQuestion = Math.floor(totalPoints / parsedVocabs.length);
        const remainder = totalPoints % parsedVocabs.length;

        const questionData = parsedVocabs.map((vocab, index) => {
          const qTotal = pointsPerQuestion + (index < remainder ? 1 : 0);
          const wordScore = Math.floor(qTotal * 0.5);
          const posScore = Math.floor(qTotal * 0.25);
          const meaningScore = qTotal - wordScore - posScore;

          return {
            examId,
            wordOrder: index + 1,
            correctWord: vocab.word,
            correctPos: vocab.pos,
            correctMeaning: vocab.meaning,
            wordScore,
            posScore,
            meaningScore,
          };
        });
        await storage.createQuestions(questionData);

        // RE-CALCULATE SCORES for all submissions of this exam using weighted scoring
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
              const studentMeaning = normalizeChinese(answer.studentMeaning);

              const correctWords = question.correctWord.split(/[,\/]/).map(w => w.trim().toLowerCase());
              const correctPosList = question.correctPos.split(/[,\/]/).map(p => p.trim().toLowerCase());
              const correctMeanings = question.correctMeaning.split(/[,\/]/).map(m => normalizeChinese(m));

              const wordCorrect = correctWords.includes(studentWord);
              const posCorrect = correctPosList.includes(studentPos);
              const meaningCorrect = correctMeanings.includes(studentMeaning);
              
              // Calculate earned score based on weighted scoring
              let earnedScore = 0;
              if (wordCorrect) earnedScore += question.wordScore;
              if (posCorrect) earnedScore += question.posScore;
              if (meaningCorrect) earnedScore += question.meaningScore;
              
              newTotalScore += earnedScore;
              
              const isCorrect = wordCorrect && posCorrect && meaningCorrect;
              
              // Update individual answer correctness with all fields
              await storage.updateAnswerDetail(answer.id, { 
                isCorrect,
                wordCorrect,
                posCorrect,
                meaningCorrect,
                earnedScore,
              });
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
      
      // Return sentences for text exams, questions for vocab exams
      if (exam.examType === "text") {
        const sentences = await storage.getTextSentencesByExamId(examId);
        res.json({ ...exam, sentences });
      } else {
        const questions = await storage.getQuestionsByExamId(examId);
        res.json({ ...exam, questions });
      }
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
      
      // Calculate score with weighted scoring per part
      // - English word and POS: case-insensitive
      // - Chinese meaning: normalized comparison
      let totalScore = 0;
      const answerDetailsList: { 
        questionId: number; 
        studentWord: string;
        studentPos: string;
        studentMeaning: string;
        isCorrect: boolean;
        wordCorrect: boolean;
        posCorrect: boolean;
        meaningCorrect: boolean;
        earnedScore: number;
      }[] = [];

      for (const answer of answers) {
        const question = questions.find(q => q.id === answer.questionId);
        if (question) {
          const studentWord = answer.studentWord.trim().toLowerCase();
          const studentPos = answer.studentPos.trim().toLowerCase();
          const studentMeaning = normalizeChinese(answer.studentMeaning);

          // Split correct answers by comma or slash
          const correctWords = question.correctWord.split(/[,\/]/).map(w => w.trim().toLowerCase());
          const correctPosList = question.correctPos.split(/[,\/]/).map(p => p.trim().toLowerCase());
          const correctMeanings = question.correctMeaning.split(/[,\/]/).map(m => normalizeChinese(m));

          const wordCorrect = correctWords.includes(studentWord);
          const posCorrect = correctPosList.includes(studentPos);
          const meaningCorrect = correctMeanings.includes(studentMeaning);
          
          // Calculate earned score based on weighted scoring
          let earnedScore = 0;
          if (wordCorrect) earnedScore += question.wordScore;
          if (posCorrect) earnedScore += question.posScore;
          if (meaningCorrect) earnedScore += question.meaningScore;
          
          totalScore += earnedScore;
          
          const isCorrect = wordCorrect && posCorrect && meaningCorrect;
          
          answerDetailsList.push({
            questionId: answer.questionId,
            studentWord: answer.studentWord,
            studentPos: answer.studentPos,
            studentMeaning: answer.studentMeaning,
            isCorrect,
            wordCorrect,
            posCorrect,
            meaningCorrect,
            earnedScore,
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
        totalScore: Math.round(totalScore),
      } as any);

      // Create answer details with individual part scores
      await storage.createAnswerDetails(
        answerDetailsList.map(d => ({
          submissionId: submission.id,
          questionId: d.questionId,
          studentWord: d.studentWord,
          studentPos: d.studentPos,
          studentMeaning: d.studentMeaning,
          isCorrect: d.isCorrect,
          wordCorrect: d.wordCorrect,
          posCorrect: d.posCorrect,
          meaningCorrect: d.meaningCorrect,
          earnedScore: d.earnedScore,
        }))
      );

      // Calculate max possible score for display
      const maxScore = questions.reduce((sum, q) => sum + q.wordScore + q.posScore + q.meaningScore, 0);

      res.json({ 
        totalScore, 
        maxScore,
        totalQuestions: questions.length,
        studentName 
      });
    } catch (error) {
      console.error("Submission error:", error);
      res.status(500).json({ message: "Failed to submit answers" });
    }
  });

  // Submit Text Dictation (AI-scored) - supports sentence-by-sentence or full text mode
  app.post("/api/text-submissions", async (req, res) => {
    try {
      const { examId, studentName, studentNumber, originalClass, mixedClass, studentText, sentenceAnswers } = req.body;
      
      if (!examId || !studentName || !studentNumber || !originalClass || !mixedClass) {
        res.status(400).json({ message: "Missing required fields" });
        return;
      }

      // Get the exam to find the correct text
      const exam = await storage.getExamById(examId);
      if (!exam || exam.examType !== "text") {
        res.status(400).json({ message: "Invalid exam or not a text dictation exam" });
        return;
      }

      // Get sentences for this exam
      const sentences = await storage.getTextSentencesByExamId(examId);
      
      // Sentence-by-sentence mode
      if (sentenceAnswers && Array.isArray(sentenceAnswers) && sentences.length > 0) {
        let totalScore = 0;
        let maxScore = 0;
        const sentenceResults: { sentenceId: number; earned: number; max: number; feedback: string }[] = [];
        
        for (const sentence of sentences) {
          const answer = sentenceAnswers.find((a: { sentenceId: number; studentSentence: string }) => a.sentenceId === sentence.id);
          const studentSentence = answer?.studentSentence || "";
          maxScore += sentence.maxScore;
          
          let earnedScore = 0;
          let sentenceFeedback = "";
          
          try {
            // AI scoring for each sentence
            const prompt = `Compare the student's sentence with the correct sentence and give a score out of ${sentence.maxScore}.

CORRECT SENTENCE:
${sentence.correctSentence}

STUDENT'S SENTENCE:
${studentSentence}

Grading criteria (proportional to ${sentence.maxScore} points):
- Spelling accuracy (50%): Deduct points for each spelling mistake
- Punctuation accuracy (25%): Deduct points for punctuation errors
- Capitalization accuracy (15%): Deduct points for capitalization errors  
- Word omission/addition (10%): Deduct points for missing or extra words

Respond in this exact JSON format only:
{"score": <number 0-${sentence.maxScore}>, "feedback": "<brief feedback in Chinese, max 20 chars>"}`;

            const response = await poeClient.chat.completions.create({
              model: "Gemini-3-Flash",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 200,
            });

            const content = response.choices[0]?.message?.content || "";
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              earnedScore = Math.max(0, Math.min(sentence.maxScore, parsed.score || 0));
              sentenceFeedback = parsed.feedback || "";
            }
          } catch (aiError) {
            console.error("AI scoring error for sentence:", aiError);
            // Fallback: character comparison
            const correctNorm = sentence.correctSentence.toLowerCase().replace(/\s+/g, ' ').trim();
            const studentNorm = studentSentence.toLowerCase().replace(/\s+/g, ' ').trim();
            
            if (studentNorm.length === 0) {
              earnedScore = 0;
              sentenceFeedback = "未填寫";
            } else {
              const maxLen = Math.max(correctNorm.length, studentNorm.length);
              let matches = 0;
              for (let i = 0; i < Math.min(correctNorm.length, studentNorm.length); i++) {
                if (correctNorm[i] === studentNorm[i]) matches++;
              }
              earnedScore = Math.round((matches / maxLen) * sentence.maxScore);
              sentenceFeedback = "基本比對評分";
            }
          }
          
          totalScore += earnedScore;
          sentenceResults.push({
            sentenceId: sentence.id,
            earned: earnedScore,
            max: sentence.maxScore,
            feedback: sentenceFeedback,
          });
        }
        
        // Combine all student sentences for storage
        const combinedText = sentenceAnswers
          .sort((a: { sentenceId: number }, b: { sentenceId: number }) => {
            const sentA = sentences.find(s => s.id === a.sentenceId);
            const sentB = sentences.find(s => s.id === b.sentenceId);
            return (sentA?.sentenceOrder || 0) - (sentB?.sentenceOrder || 0);
          })
          .map((a: { studentSentence: string }) => a.studentSentence)
          .join(" ");
        
        // Save submission
        const submission = await storage.createTextSubmission({
          examId,
          studentName,
          studentNumber,
          originalClass,
          mixedClass,
          studentText: combinedText,
          totalScore,
          maxScore,
          feedback: sentenceResults.map((r, i) => `第${i + 1}句: ${r.earned}/${r.max}分`).join("; "),
        });
        
        // Save sentence answer details
        const answerDetails = sentenceResults.map((r, i) => ({
          submissionId: submission.id,
          sentenceId: r.sentenceId,
          studentSentence: sentenceAnswers.find((a: { sentenceId: number }) => a.sentenceId === r.sentenceId)?.studentSentence || "",
          earnedScore: r.earned,
          feedback: r.feedback,
        }));
        await storage.createTextAnswerDetails(answerDetails);

        res.json({
          totalScore,
          maxScore,
          feedback: sentenceResults.map((r, i) => `第${i + 1}句: ${r.earned}/${r.max}分 - ${r.feedback}`).join("\n"),
          sentenceResults,
          studentName,
        });
        return;
      }

      // Legacy full text mode
      if (!studentText) {
        res.status(400).json({ message: "Student text is required" });
        return;
      }

      if (!exam.correctText) {
        res.status(400).json({ message: "Exam has no correct text configured" });
        return;
      }

      let totalScore = 0;
      let feedback = "";

      try {
        const prompt = `You are a strict English dictation grading assistant. Compare the student's text with the correct text and give a score out of 100.

CORRECT TEXT:
${exam.correctText}

STUDENT'S TEXT:
${studentText}

Grading criteria:
1. Spelling accuracy (50 points): Deduct 2 points for each spelling mistake
2. Punctuation accuracy (25 points): Deduct 1 point for each punctuation error
3. Capitalization accuracy (15 points): Deduct 1 point for each capitalization error  
4. Word omission/addition (10 points): Deduct 2 points for each missing or extra word

Respond in this exact JSON format only, no other text:
{"score": <number 0-100>, "feedback": "<brief feedback in Chinese about main errors>"}`;

        const response = await poeClient.chat.completions.create({
          model: "Gemini-3-Flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          totalScore = Math.max(0, Math.min(100, parsed.score || 0));
          feedback = parsed.feedback || "";
        }
      } catch (aiError) {
        console.error("AI scoring error:", aiError);
        const correctNorm = exam.correctText.toLowerCase().replace(/\s+/g, ' ').trim();
        const studentNorm = studentText.toLowerCase().replace(/\s+/g, ' ').trim();
        
        const maxLen = Math.max(correctNorm.length, studentNorm.length);
        let matches = 0;
        for (let i = 0; i < Math.min(correctNorm.length, studentNorm.length); i++) {
          if (correctNorm[i] === studentNorm[i]) matches++;
        }
        totalScore = Math.round((matches / maxLen) * 100);
        feedback = "AI評分暫時無法使用，使用基本比對評分";
      }

      const submission = await storage.createTextSubmission({
        examId,
        studentName,
        studentNumber,
        originalClass,
        mixedClass,
        studentText,
        totalScore,
        maxScore: 100,
        feedback,
      });

      res.json({
        totalScore,
        maxScore: 100,
        feedback,
        studentName,
      });
    } catch (error) {
      console.error("Text submission error:", error);
      res.status(500).json({ message: "Failed to submit text dictation" });
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
