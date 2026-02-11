import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { examSubmissionSchema, createExamSchema, studentSubmissions, textSubmissions, exams } from "@shared/schema";
import ExcelJS from "exceljs";
import OpenAI from "openai";
import { computeBadges, BADGE_DEFINITIONS, type SubmissionRecord } from "@shared/badges";
import { db } from "./db";
import { and, eq } from "drizzle-orm";

// Poe API client for AI scoring
const poeClient = new OpenAI({
  apiKey: process.env.POE_API_KEY,
  baseURL: "https://api.poe.com/v1",
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Common Simplified-to-Traditional Chinese character mapping
const simplifiedToTraditional: Record<string, string> = {
  '复': '復', '发': '發', '历': '歷', '雇': '僱', '肤': '膚', '评': '評',
  '独': '獨', '说': '說', '镜': '鏡', '职': '職', '应': '應', '认': '認',
  '资': '資', '产': '產', '济': '濟', '经': '經', '绍': '紹', '绿': '綠',
  '见': '見', '观': '觀', '计': '計', '记': '記', '设': '設', '话': '話',
  '语': '語', '请': '請', '读': '讀', '课': '課', '调': '調', '谢': '謝',
  '买': '買', '卖': '賣', '开': '開', '关': '關', '门': '門', '间': '間',
  '问': '問', '闻': '聞', '学': '學', '实': '實', '宝': '寶', '对': '對',
  '导': '導', '将': '將', '尽': '盡', '层': '層', '岁': '歲', '师': '師',
  '帮': '幫', '广': '廣', '庆': '慶', '张': '張', '强': '強',
  '归': '歸', '当': '當', '录': '錄', '总': '總', '扩': '擴', '护': '護',
  '报': '報', '担': '擔', '择': '擇', '据': '據', '损': '損', '换': '換',
  '接': '接', '挥': '揮', '搜': '搜', '撑': '撐', '收': '收', '数': '數',
  '整': '整', '斗': '鬥', '断': '斷', '无': '無', '旧': '舊', '时': '時',
  '显': '顯', '书': '書', '机': '機', '权': '權', '来': '來', '标': '標',
  '样': '樣', '检': '檢', '欢': '歡', '气': '氣', '汇': '匯', '没': '沒',
  '注': '註', '洁': '潔', '活': '活', '满': '滿', '渐': '漸', '源': '源',
  '准': '準', '热': '熱', '爱': '愛', '牺': '犧', '环': '環', '现': '現',
  '理': '理', '画': '畫', '异': '異', '疗': '療', '皮': '皮', '监': '監',
  '盖': '蓋', '码': '碼', '确': '確', '种': '種', '积': '積', '称': '稱',
  '笔': '筆', '签': '簽', '筑': '築', '节': '節', '纪': '紀', '纯': '純',
  '线': '線', '组': '組', '细': '細', '终': '終', '结': '結', '给': '給',
  '继': '繼', '绩': '績', '续': '續', '维': '維', '综': '綜', '缓': '緩',
  '练': '練', '联': '聯', '脑': '腦', '脸': '臉', '艺': '藝', '获': '獲',
  '营': '營', '虑': '慮', '补': '補', '装': '裝', '规': '規', '览': '覽',
  '触': '觸', '证': '證', '试': '試', '识': '識', '详': '詳', '谁': '誰',
  '质': '質', '购': '購', '贸': '貿', '费': '費', '赛': '賽', '赢': '贏',
  '车': '車', '转': '轉', '载': '載', '输': '輸', '达': '達', '边': '邊',
  '还': '還', '进': '進', '远': '遠', '选': '選', '递': '遞', '释': '釋',
  '针': '針', '钱': '錢', '铁': '鐵', '银': '銀', '错': '錯', '随': '隨',
  '险': '險', '难': '難', '须': '須', '预': '預', '领': '領', '题': '題',
  '马': '馬', '验': '驗', '鱼': '魚', '龙': '龍', '构': '構', '体': '體',
  '兰': '蘭', '举': '舉', '从': '從', '传': '傳', '价': '價', '优': '優',
  '仅': '僅', '众': '眾', '伤': '傷', '华': '華', '单': '單', '危': '危',
  '压': '壓', '县': '縣', '参': '參', '双': '雙', '响': '響',
  '医': '醫', '协': '協', '厂': '廠', '原': '原', '听': '聽', '嘱': '囑',
  '园': '園', '国': '國', '图': '圖', '团': '團', '圣': '聖', '坏': '壞',
  '声': '聲', '处': '處', '备': '備', '够': '夠', '头': '頭', '夺': '奪',
  '奋': '奮', '妇': '婦', '嫔': '嬪', '属': '屬', '带': '帶',
};

function convertSimplifiedToTraditional(text: string): string {
  let result = '';
  for (const char of text) {
    result += simplifiedToTraditional[char] || char;
  }
  return result;
}

// Helper function to normalize Chinese text for comparison
function normalizeChinese(text: string): string {
  let normalized = text
    .trim()
    .replace(/\s+/g, '')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/「/g, '"')
    .replace(/」/g, '"')
    .replace(/『/g, "'")
    .replace(/』/g, "'")
    .replace(/《/g, '<')
    .replace(/》/g, '>')
    .replace(/【/g, '[')
    .replace(/】/g, ']');
  normalized = convertSimplifiedToTraditional(normalized);
  return normalized;
}

// Check if student meaning matches correct meaning with multiple strategies
function checkMeaningMatch(studentMeaning: string, correctMeaningRaw: string): boolean {
  if (!studentMeaning || studentMeaning.length === 0) return false;

  const normalizedStudent = normalizeChinese(studentMeaning);
  const normalizedFullCorrect = normalizeChinese(correctMeaningRaw);

  // Strategy 1: Full exact match (before splitting)
  if (normalizedStudent === normalizedFullCorrect) return true;

  // Strategy 2: Split correct answer and check if student matches any part
  const correctParts = correctMeaningRaw.split(/[,，\/、]/).map(m => normalizeChinese(m)).filter(m => m.length > 0);
  if (correctParts.includes(normalizedStudent)) return true;

  // Strategy 3: Split student answer too and check if any student part matches any correct part
  const studentParts = studentMeaning.split(/[,，\/、]/).map(m => normalizeChinese(m)).filter(m => m.length > 0);
  for (const sp of studentParts) {
    if (correctParts.includes(sp)) return true;
  }

  // Strategy 4: Remove trailing 的 and check again
  const studentNoSuffix = normalizedStudent.replace(/的$/, '');
  for (const cp of correctParts) {
    const correctNoSuffix = cp.replace(/的$/, '');
    if (studentNoSuffix === correctNoSuffix) return true;
    if (studentNoSuffix === cp) return true;
    if (normalizedStudent === correctNoSuffix) return true;
  }

  return false;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Helper: get all submissions for a student (both vocab and text)
  async function getStudentSubmissions(studentName: string, studentNumber: number, originalClass: string): Promise<SubmissionRecord[]> {
    const vocabSubs = await db.select({
      totalScore: studentSubmissions.totalScore,
      submittedAt: studentSubmissions.submittedAt,
      examId: studentSubmissions.examId,
    }).from(studentSubmissions).where(
      and(
        eq(studentSubmissions.studentName, studentName),
        eq(studentSubmissions.studentNumber, studentNumber),
        eq(studentSubmissions.originalClass, originalClass),
      )
    );

    const textSubs = await db.select({
      totalScore: textSubmissions.totalScore,
      submittedAt: textSubmissions.submittedAt,
      examId: textSubmissions.examId,
    }).from(textSubmissions).where(
      and(
        eq(textSubmissions.studentName, studentName),
        eq(textSubmissions.studentNumber, studentNumber),
        eq(textSubmissions.originalClass, originalClass),
      )
    );

    const vocabExamIds = [...new Set(vocabSubs.map(s => s.examId))];
    const textExamIds = [...new Set(textSubs.map(s => s.examId))];
    const allExamIds = [...new Set([...vocabExamIds, ...textExamIds])];

    const examTypeMap: Record<number, string> = {};
    for (const eid of allExamIds) {
      const exam = await storage.getExamById(eid);
      if (exam) examTypeMap[eid] = exam.examType;
    }

    const records: SubmissionRecord[] = [
      ...vocabSubs.map(s => ({
        totalScore: s.totalScore,
        examType: examTypeMap[s.examId] || "vocab",
        submittedAt: s.submittedAt,
      })),
      ...textSubs.map(s => ({
        totalScore: s.totalScore,
        examType: examTypeMap[s.examId] || "text",
        submittedAt: s.submittedAt,
      })),
    ];

    return records;
  }

  // Get student badges
  app.get("/api/student-badges", async (req, res) => {
    try {
      const { studentName, studentNumber, originalClass } = req.query;
      if (!studentName || !studentNumber || !originalClass) {
        res.status(400).json({ message: "Missing required query parameters" });
        return;
      }

      const records = await getStudentSubmissions(
        studentName as string,
        parseInt(studentNumber as string),
        originalClass as string,
      );

      const badgeIds = computeBadges(records);
      const badges = badgeIds.map(id => BADGE_DEFINITIONS.find(b => b.id === id)!).filter(Boolean);

      const scores = records.map(r => r.totalScore);
      const stats = {
        totalExams: records.length,
        averageScore: records.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        highestScore: records.length > 0 ? Math.max(...scores) : 0,
      };

      res.json({ badges, stats });
    } catch (error) {
      console.error("Student badges error:", error);
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

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

              const correctWords = question.correctWord.split(/[,，\/、]/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
              const correctPosList = question.correctPos.split(/[,，\/、]/).map(p => p.trim().toLowerCase()).filter(p => p.length > 0);
              const correctMeanings = question.correctMeaning.split(/[,，\/、]/).map(m => normalizeChinese(m)).filter(m => m.length > 0);

              const wordCorrect = correctWords.includes(studentWord);
              const posCorrect = correctPosList.includes(studentPos);
              
              // Exact match check for meaning
              let meaningCorrect = correctMeanings.includes(studentMeaning);
              let earnedScore = 0;
              
              // If not an exact match and student provided an answer, use AI to check meaning
              if (!meaningCorrect && studentMeaning.length > 0) {
                try {
                  const prompt = `You are grading a vocabulary test. Compare the student's Chinese meaning with the correct answer for the English word "${question.correctWord}".
The student's answer should be considered CORRECT if it matches ANY ONE of the acceptable meanings, or is a valid synonym/paraphrase.

CORRECT CHINESE MEANING(S):
${question.correctMeaning}

STUDENT'S CHINESE MEANING:
${answer.studentMeaning}

Respond in this exact JSON format only:
{"isCorrect": <boolean>, "feedback": "<brief feedback in Chinese>"}`;

                  const response = await poeClient.chat.completions.create({
                    model: "gemini-2.5-flash",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 100,
                  });

                  const content = response.choices[0]?.message?.content || "";
                  const jsonMatch = content.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.isCorrect) {
                      meaningCorrect = true;
                    }
                  }
                } catch (aiError) {
                  console.error("AI vocab meaning scoring error (re-calculate):", aiError);
                }
              }
              
              // Calculate earned score based on weighted scoring
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

  // Admin re-score all vocab submissions (uses AI for meaning comparison)
  app.post("/api/admin/rescore-vocab", async (req, res) => {
    try {
      const { password } = req.body;
      if (password !== ADMIN_PASSWORD) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const allExams = await storage.getExams();
      const vocabExams = allExams.filter(e => e.examType === "vocab" || e.examType === "vocabulary");
      let updatedCount = 0;

      for (const exam of vocabExams) {
        const submissions = await storage.getSubmissionsByExamId(exam.id);
        const questions = await storage.getQuestionsByExamId(exam.id);

        for (const sub of submissions) {
          const answers = await storage.getAnswerDetailsBySubmissionId(sub.id);
          let newTotalScore = 0;

          for (const answer of answers) {
            const question = questions.find(q => q.id === answer.questionId);
            if (question) {
              const studentWord = answer.studentWord.trim().toLowerCase();
              const studentPos = answer.studentPos.trim().toLowerCase();

              const correctWords = question.correctWord.split(/[,，\/、]/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
              const correctPosList = question.correctPos.split(/[,，\/、]/).map(p => p.trim().toLowerCase()).filter(p => p.length > 0);

              const wordCorrect = correctWords.includes(studentWord);
              const posCorrect = correctPosList.includes(studentPos);
              let meaningCorrect = checkMeaningMatch(answer.studentMeaning, question.correctMeaning);
              let earnedScore = 0;

              if (!meaningCorrect && answer.studentMeaning.trim().length > 0) {
                try {
                  const prompt = `You are grading a Chinese vocabulary meaning test for the English word "${question.correctWord}".

RULES - Mark as CORRECT if the student's answer:
1. Is a valid Chinese synonym or paraphrase of ANY of the correct meanings
2. Uses simplified Chinese characters instead of traditional (e.g. 恢复=恢復, 雇主=僱主, 皮肤=皮膚)
3. Has minor differences like 有自信的/有自信心的/有信心的 (all mean "confident")
4. Uses 皮膚瑕疵 vs 肌膚瑕疵 (both mean "skin blemish")
5. Uses 注重 vs 著重 (both mean "focus on")
6. Captures the core meaning even if wording differs slightly

CORRECT MEANING(S): ${question.correctMeaning}
STUDENT'S ANSWER: ${answer.studentMeaning}

Reply ONLY with this JSON: {"isCorrect": true} or {"isCorrect": false}`;

                  const response = await poeClient.chat.completions.create({
                    model: "gemini-2.5-flash",
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 300,
                  });

                  const content = response.choices[0]?.message?.content || "";
                  console.log(`Re-score AI check: "${answer.studentMeaning}" vs "${question.correctMeaning}" => ${content}`);
                  const jsonMatch = content.match(/\{[\s\S]*?\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.isCorrect === true) {
                      meaningCorrect = true;
                    }
                  }
                } catch (aiError) {
                  console.error("AI re-score error:", aiError);
                }
              }

              if (wordCorrect) earnedScore += question.wordScore;
              if (posCorrect) earnedScore += question.posScore;
              if (meaningCorrect) earnedScore += question.meaningScore;
              newTotalScore += earnedScore;

              const isCorrect = wordCorrect && posCorrect && meaningCorrect;
              await storage.updateAnswerDetail(answer.id, {
                isCorrect, wordCorrect, posCorrect, meaningCorrect, earnedScore,
              });
            }
          }
          await storage.updateSubmissionScore(sub.id, Math.round(newTotalScore));
          updatedCount++;
        }
      }

      res.json({ success: true, updatedSubmissions: updatedCount });
    } catch (error) {
      console.error("Re-score error:", error);
      res.status(500).json({ message: "Failed to re-score" });
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

          const correctWords = question.correctWord.split(/[,，\/、]/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
          const correctPosList = question.correctPos.split(/[,，\/、]/).map(p => p.trim().toLowerCase()).filter(p => p.length > 0);

          const wordCorrect = correctWords.includes(studentWord);
          const posCorrect = correctPosList.includes(studentPos);
          
          let meaningCorrect = checkMeaningMatch(answer.studentMeaning, question.correctMeaning);
          let earnedScore = 0;
          
          if (!meaningCorrect && answer.studentMeaning.trim().length > 0) {
            try {
              const prompt = `You are grading a Chinese vocabulary meaning test for the English word "${question.correctWord}".

RULES - Mark as CORRECT if the student's answer:
1. Is a valid Chinese synonym or paraphrase of ANY of the correct meanings
2. Uses simplified Chinese characters instead of traditional (e.g. 恢复=恢復, 雇主=僱主, 皮肤=皮膚)
3. Has minor differences like 有自信的/有自信心的/有信心的 (all mean "confident")
4. Uses 皮膚瑕疵 vs 肌膚瑕疵 (both mean "skin blemish")
5. Uses 注重 vs 著重 (both mean "focus on")
6. Captures the core meaning even if wording differs slightly

CORRECT MEANING(S): ${question.correctMeaning}
STUDENT'S ANSWER: ${answer.studentMeaning}

Reply ONLY with this JSON: {"isCorrect": true} or {"isCorrect": false}`;

              const response = await poeClient.chat.completions.create({
                model: "gemini-2.5-flash",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 300,
              });

              const content = response.choices[0]?.message?.content || "";
              console.log(`AI meaning check: "${answer.studentMeaning}" vs "${question.correctMeaning}" => ${content}`);
              const jsonMatch = content.match(/\{[\s\S]*?\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.isCorrect === true) {
                  meaningCorrect = true;
                }
              }
            } catch (aiError) {
              console.error("AI vocab meaning scoring error:", aiError);
            }
          }
          
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

      // Compute newly earned badges
      let earnedBadges: string[] = [];
      try {
        const prevRecords = await getStudentSubmissions(studentName, studentNumber, originalClass);
        const prevBadgeIds = computeBadges(prevRecords.filter(r => new Date(r.submittedAt).getTime() < Date.now() - 5000));
        const allBadgeIds = computeBadges(prevRecords);
        earnedBadges = allBadgeIds.filter(id => !prevBadgeIds.includes(id));
      } catch (e) {
        console.error("Badge computation error:", e);
      }

      res.json({ 
        totalScore, 
        maxScore,
        totalQuestions: questions.length,
        studentName,
        earnedBadges,
        questionResults: answerDetailsList.map((d, idx) => ({
          questionIndex: idx + 1,
          studentWord: d.studentWord,
          studentPos: d.studentPos,
          studentMeaning: d.studentMeaning,
          wordCorrect: d.wordCorrect,
          posCorrect: d.posCorrect,
          meaningCorrect: d.meaningCorrect,
          earnedScore: d.earnedScore,
        })),
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
            const prompt = `Grade this dictation leniently. Full=${sentence.maxScore}pts. Deduct: misspelled word -1pt, missing/extra word -1pt, punctuation error -0.5pt, capitalization -0.5pt total. Minor typo(1-2 letters off) -0.5pt only. Be generous.

Correct: ${sentence.correctSentence}
Student: ${studentSentence}

Reply ONLY with JSON. Feedback in Traditional Chinese, max 20 chars, be encouraging but mention specific wrong words if any:
{"score":N,"feedback":"..."}`;


            const response = await poeClient.chat.completions.create({
              model: "gemini-2.5-flash",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 500,
              temperature: 0.3,
            });

            let content = response.choices[0]?.message?.content || "";
            content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            console.log("AI response for sentence:", content);

            let parsed: any = null;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try { parsed = JSON.parse(jsonMatch[0]); } catch {}
            }
            if (!parsed) {
              const scoreMatch = content.match(/"score"\s*:\s*([\d.]+)/);
              const feedbackMatch = content.match(/"feedback"\s*:\s*"([^"]*)/);
              if (scoreMatch) {
                parsed = {
                  score: parseFloat(scoreMatch[1]),
                  feedback: feedbackMatch ? feedbackMatch[1] : "",
                };
              }
            }
            if (parsed && parsed.score !== undefined) {
              earnedScore = Math.max(0, Math.min(sentence.maxScore, Math.round(Number(parsed.score) || 0)));
              sentenceFeedback = parsed.feedback || "";
            } else {
              console.error("Could not parse AI response:", content);
            }
          } catch (aiError: any) {
            console.error("AI scoring error for sentence:", aiError?.message || aiError);
            const correctWords = sentence.correctSentence.toLowerCase().replace(/[^\w\s']/g, '').trim().split(/\s+/);
            const studentWords = studentSentence.toLowerCase().replace(/[^\w\s']/g, '').trim().split(/\s+/);
            
            if (!studentSentence.trim()) {
              earnedScore = 0;
              sentenceFeedback = "未填寫";
            } else {
              let deductions = 0;
              const maxWords = Math.max(correctWords.length, studentWords.length);
              for (let i = 0; i < maxWords; i++) {
                if (!correctWords[i] || !studentWords[i]) {
                  deductions += 1;
                } else if (correctWords[i] !== studentWords[i]) {
                  deductions += 1;
                }
              }
              const correctPunc = (sentence.correctSentence.match(/[.,!?;:'"()-]/g) || []).join('');
              const studentPunc = (studentSentence.match(/[.,!?;:'"()-]/g) || []).join('');
              if (correctPunc !== studentPunc) deductions += 0.5;
              earnedScore = Math.max(0, Math.round(sentence.maxScore - deductions));
              sentenceFeedback = deductions === 0 ? "完全正確！" : "基本比對評分，請老師覆核";
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

        // Compute newly earned badges
        let earnedBadges: string[] = [];
        try {
          const prevRecords = await getStudentSubmissions(studentName, studentNumber, originalClass);
          const prevBadgeIds = computeBadges(prevRecords.filter(r => new Date(r.submittedAt).getTime() < Date.now() - 5000));
          const allBadgeIds = computeBadges(prevRecords);
          earnedBadges = allBadgeIds.filter(id => !prevBadgeIds.includes(id));
        } catch (e) {
          console.error("Badge computation error:", e);
        }

        res.json({
          totalScore,
          maxScore,
          earnedBadges,
          sentenceResults: sentenceResults.map(r => {
            const sentence = sentences.find(s => s.id === r.sentenceId);
            return {
              sentenceId: r.sentenceId,
              earned: r.earned,
              max: r.max,
              studentSentence: sentenceAnswers.find((a: { sentenceId: number }) => a.sentenceId === r.sentenceId)?.studentSentence || "",
              correctSentence: sentence?.correctSentence || "",
              feedback: r.feedback || "",
            };
          }),
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
        const prompt = `Grade this dictation leniently. Full=100pts. Deduct: misspelled word -1pt, missing/extra word -1pt, punctuation error -0.5pt, capitalization -0.5pt total. Minor typo(1-2 letters off) -0.5pt only. Be generous.

Correct: ${exam.correctText}
Student: ${studentText}

Reply ONLY with JSON. Feedback in Traditional Chinese, max 30 chars, be encouraging but mention specific errors:
{"score":N,"feedback":"..."}`;

        const response = await poeClient.chat.completions.create({
          model: "gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.3,
        });

        let content = response.choices[0]?.message?.content || "";
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        let parsed: any = null;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch {}
        }
        if (!parsed) {
          const scoreMatch = content.match(/"score"\s*:\s*([\d.]+)/);
          const feedbackMatch = content.match(/"feedback"\s*:\s*"([^"]*)/);
          if (scoreMatch) {
            parsed = { score: parseFloat(scoreMatch[1]), feedback: feedbackMatch ? feedbackMatch[1] : "" };
          }
        }
        if (parsed && parsed.score !== undefined) {
          totalScore = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
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

      // Compute newly earned badges
      let earnedBadges: string[] = [];
      try {
        const prevRecords = await getStudentSubmissions(studentName, studentNumber, originalClass);
        const prevBadgeIds = computeBadges(prevRecords.filter(r => new Date(r.submittedAt).getTime() < Date.now() - 5000));
        const allBadgeIds = computeBadges(prevRecords);
        earnedBadges = allBadgeIds.filter(id => !prevBadgeIds.includes(id));
      } catch (e) {
        console.error("Badge computation error:", e);
      }

      res.json({
        totalScore,
        maxScore: 100,
        earnedBadges,
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

  // Get all text submissions
  app.get("/api/text-submissions", async (req, res) => {
    try {
      const submissions = await storage.getTextSubmissions();
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch text submissions" });
    }
  });

  // Get vocab submission with details
  app.get("/api/submissions/:id", async (req, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getSubmissionWithDetails(submissionId);
      if (!submission) {
        res.status(404).json({ message: "Submission not found" });
        return;
      }
      
      // Get questions for this exam
      const questions = await storage.getQuestionsByExamId(submission.examId);
      res.json({ ...submission, questions });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch submission details" });
    }
  });

  // Get text submission with details
  app.get("/api/text-submissions/:id", async (req, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const submission = await storage.getTextSubmissionWithDetails(submissionId);
      if (!submission) {
        res.status(404).json({ message: "Submission not found" });
        return;
      }
      
      // Get sentences for this exam
      const sentences = await storage.getTextSentencesByExamId(submission.examId);
      res.json({ ...submission, sentences });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch text submission details" });
    }
  });

  // Update vocab submission score (admin adjust)
  app.patch("/api/submissions/:id", async (req, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const { totalScore, answers } = req.body;
      
      if (typeof totalScore === "number") {
        await storage.updateSubmissionScore(submissionId, totalScore);
      }
      
      // Update individual answer scores if provided
      if (answers && Array.isArray(answers)) {
        for (const answer of answers) {
          if (answer.id && typeof answer.earnedScore === "number") {
            await storage.updateAnswerDetail(answer.id, { earnedScore: answer.earnedScore });
          }
        }
      }
      
      const updated = await storage.getSubmissionWithDetails(submissionId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update submission" });
    }
  });

  // Update text submission score (admin adjust)
  app.patch("/api/text-submissions/:id", async (req, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      const { totalScore, answers } = req.body;
      
      if (typeof totalScore === "number") {
        await storage.updateTextSubmissionScore(submissionId, totalScore);
      }
      
      // Update individual answer scores if provided
      if (answers && Array.isArray(answers)) {
        for (const answer of answers) {
          if (answer.id && typeof answer.earnedScore === "number") {
            await storage.updateTextAnswerDetail(answer.id, { earnedScore: answer.earnedScore });
          }
        }
      }
      
      const updated = await storage.getTextSubmissionWithDetails(submissionId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update text submission" });
    }
  });

  // Get analytics for an exam
  app.get("/api/exams/:id/analytics", async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const exam = await storage.getExamById(examId);
      if (!exam) {
        res.status(404).json({ message: "Exam not found" });
        return;
      }

      if (exam.examType === "text") {
        const submissions = await storage.getTextSubmissionsByExamId(examId);
        const sentences = await storage.getTextSentencesByExamId(examId);
        
        if (submissions.length === 0) {
          res.json({
            examType: "text",
            totalSubmissions: 0,
            averageScore: 0,
            maxScore: 100,
            highestScore: 0,
            lowestScore: 0,
            passRate: 0,
            scoreDistribution: [],
            sentenceAnalysis: [],
          });
          return;
        }

        const scores = submissions.map(s => s.totalScore);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const passCount = scores.filter(s => s >= 60).length;

        // Score distribution in 10-point buckets
        const distribution = Array(11).fill(0);
        scores.forEach(s => {
          const bucket = Math.min(Math.floor(s / 10), 10);
          distribution[bucket]++;
        });

        // Sentence difficulty analysis
        const sentenceAnalysis = await Promise.all(sentences.map(async (sentence) => {
          let totalEarned = 0;
          let count = 0;
          
          for (const sub of submissions) {
            const details = await storage.getTextAnswerDetailsBySubmissionId(sub.id);
            const detail = details.find(d => d.sentenceId === sentence.id);
            if (detail) {
              totalEarned += detail.earnedScore;
              count++;
            }
          }
          
          return {
            sentenceId: sentence.id,
            order: sentence.sentenceOrder,
            maxScore: sentence.maxScore,
            averageScore: count > 0 ? totalEarned / count : 0,
            correctRate: count > 0 ? (totalEarned / count) / sentence.maxScore * 100 : 0,
          };
        }));

        res.json({
          examType: "text",
          totalSubmissions: submissions.length,
          averageScore: Math.round(avg * 10) / 10,
          maxScore: 100,
          highestScore: Math.max(...scores),
          lowestScore: Math.min(...scores),
          passRate: Math.round((passCount / submissions.length) * 100),
          scoreDistribution: distribution,
          sentenceAnalysis,
        });
      } else {
        const submissions = await storage.getSubmissionsByExamId(examId);
        const questions = await storage.getQuestionsByExamId(examId);
        
        if (submissions.length === 0) {
          res.json({
            examType: "vocab",
            totalSubmissions: 0,
            averageScore: 0,
            maxScore: 100,
            highestScore: 0,
            lowestScore: 0,
            passRate: 0,
            scoreDistribution: [],
            questionAnalysis: [],
          });
          return;
        }

        const scores = submissions.map(s => s.totalScore);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const passCount = scores.filter(s => s >= 60).length;

        const distribution = Array(11).fill(0);
        scores.forEach(s => {
          const bucket = Math.min(Math.floor(s / 10), 10);
          distribution[bucket]++;
        });

        // Question difficulty analysis
        const questionAnalysis = await Promise.all(questions.map(async (q) => {
          let wordCorrectCount = 0;
          let posCorrectCount = 0;
          let meaningCorrectCount = 0;
          let totalCount = 0;
          
          for (const sub of submissions) {
            const details = await storage.getAnswerDetailsBySubmissionId(sub.id);
            const detail = details.find(d => d.questionId === q.id);
            if (detail) {
              if (detail.wordCorrect) wordCorrectCount++;
              if (detail.posCorrect) posCorrectCount++;
              if (detail.meaningCorrect) meaningCorrectCount++;
              totalCount++;
            }
          }
          
          return {
            questionId: q.id,
            order: q.wordOrder,
            word: q.correctWord,
            pos: q.correctPos,
            meaning: q.correctMeaning,
            wordCorrectRate: totalCount > 0 ? Math.round((wordCorrectCount / totalCount) * 100) : 0,
            posCorrectRate: totalCount > 0 ? Math.round((posCorrectCount / totalCount) * 100) : 0,
            meaningCorrectRate: totalCount > 0 ? Math.round((meaningCorrectCount / totalCount) * 100) : 0,
            overallCorrectRate: totalCount > 0 ? Math.round(((wordCorrectCount + posCorrectCount + meaningCorrectCount) / (totalCount * 3)) * 100) : 0,
          };
        }));

        res.json({
          examType: "vocab",
          totalSubmissions: submissions.length,
          averageScore: Math.round(avg * 10) / 10,
          maxScore: 100,
          highestScore: Math.max(...scores),
          lowestScore: Math.min(...scores),
          passRate: Math.round((passCount / submissions.length) * 100),
          scoreDistribution: distribution,
          questionAnalysis,
        });
      }
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // ==================== Answer Sheet Builder Routes ====================

  // Get all answer sheet sessions
  app.get("/api/answer-sheets", async (req, res) => {
    try {
      const sessions = await storage.getAnswerSheetSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch answer sheets" });
    }
  });

  // Get single answer sheet session
  app.get("/api/answer-sheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.getAnswerSheetSessionById(id);
      if (!session) {
        res.status(404).json({ message: "Answer sheet not found" });
        return;
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch answer sheet" });
    }
  });

  // Create answer sheet session (supports both old items format and new parts format)
  app.post("/api/answer-sheets", async (req, res) => {
    try {
      const { title, paperLink, items, parts } = req.body;
      
      if (!title || typeof title !== "string" || !title.trim()) {
        res.status(400).json({ message: "Title is required" });
        return;
      }
      
      if (!paperLink || typeof paperLink !== "string") {
        res.status(400).json({ message: "Paper link is required" });
        return;
      }
      
      // Support both old format (items) and new format (parts)
      let itemsJson: string;
      if (parts && Array.isArray(parts)) {
        // New parts format
        const totalQuestions = parts.reduce((sum: number, p: any) => sum + (p.questions?.length || 0), 0);
        if (totalQuestions === 0) {
          res.status(400).json({ message: "At least one question is required" });
          return;
        }
        itemsJson = JSON.stringify(parts);
      } else if (items && Array.isArray(items) && items.length > 0) {
        // Old format
        itemsJson = JSON.stringify(items);
      } else {
        res.status(400).json({ message: "At least one question is required" });
        return;
      }

      const session = await storage.createAnswerSheetSession({
        title: title.trim(),
        paperLink: paperLink.trim(),
        itemsJson,
      });

      res.json(session);
    } catch (error) {
      console.error("Create answer sheet error:", error);
      res.status(500).json({ message: "Failed to create answer sheet" });
    }
  });

  // Update answer sheet session
  app.patch("/api/answer-sheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { title, paperLink, items } = req.body;

      const updateData: any = {};
      if (title) updateData.title = title.trim();
      if (paperLink) updateData.paperLink = paperLink.trim();
      if (items) updateData.itemsJson = JSON.stringify(items);

      const updated = await storage.updateAnswerSheetSession(id, updateData);
      if (!updated) {
        res.status(404).json({ message: "Answer sheet not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update answer sheet" });
    }
  });

  // Delete answer sheet session
  app.delete("/api/answer-sheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAnswerSheetSession(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete answer sheet" });
    }
  });

  // Submit answer sheet answers
  app.post("/api/answer-sheets/:id/submit", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const { studentName, studentNumber, originalClass, mixedClass, answers } = req.body;

      if (!studentName || !studentNumber || !originalClass || !answers) {
        res.status(400).json({ message: "Missing required fields" });
        return;
      }

      const session = await storage.getAnswerSheetSessionById(sessionId);
      if (!session) {
        res.status(404).json({ message: "Answer sheet not found" });
        return;
      }

      const parsed = JSON.parse(session.itemsJson);
      
      // Determine format: parts or flat items
      interface QuestionItemType { id: number; type: string; correct: string; options?: string[] }
      interface PartItemType { partId: string; partName: string; questions: QuestionItemType[] }
      
      let allQuestions: { partId?: string; partName?: string; question: QuestionItemType }[] = [];
      
      if (Array.isArray(parsed) && parsed.length > 0 && 'partId' in parsed[0]) {
        // New parts format
        const parts = parsed as PartItemType[];
        for (const part of parts) {
          for (const q of part.questions) {
            allQuestions.push({ partId: part.partId, partName: part.partName, question: q });
          }
        }
      } else {
        // Old flat format
        const items = parsed as QuestionItemType[];
        for (const q of items) {
          allQuestions.push({ question: q });
        }
      }
      
      // Calculate score - 100-point scale with automatic distribution
      // answers format: { "partId:questionId": answer } or { "questionId": answer }
      const totalQuestions = allQuestions.length;
      const maxScore = 100; // Always 100 points
      
      // Calculate points per question - distribute evenly, handle remainder
      const basePoints = Math.floor(100 / totalQuestions);
      const remainder = 100 - (basePoints * totalQuestions);
      
      let totalScore = 0;
      let questionIndex = 0;
      
      for (const { partId, question } of allQuestions) {
        // First 'remainder' questions get 1 extra point
        const pointsForThis = basePoints + (questionIndex < remainder ? 1 : 0);
        questionIndex++;
        
        // Try both key formats
        const key1 = partId ? `${partId}:${question.id}` : String(question.id);
        const key2 = String(question.id);
        const studentAnswer = answers[key1] || answers[key2];
        
        if (studentAnswer) {
          const correct = question.correct.trim().toLowerCase();
          const student = String(studentAnswer).trim().toLowerCase();
          if (correct === student) {
            totalScore += pointsForThis;
          }
        }
      }

      const submission = await storage.createAnswerSheetSubmission({
        sessionId,
        studentName,
        studentNumber: parseInt(studentNumber),
        originalClass,
        mixedClass: mixedClass || "",
        answersJson: JSON.stringify(answers),
        totalScore,
        maxScore,
      });

      res.json({
        submissionId: submission.id,
        totalScore,
        maxScore,
        percentage: Math.round((totalScore / maxScore) * 100),
      });
    } catch (error) {
      console.error("Submit answer sheet error:", error);
      res.status(500).json({ message: "Failed to submit answers" });
    }
  });

  // Get submissions for an answer sheet
  app.get("/api/answer-sheets/:id/submissions", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const submissions = await storage.getAnswerSheetSubmissionsBySessionId(sessionId);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // Delete vocab submission
  app.delete("/api/submissions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteSubmission(id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ message: "Submission not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete submission" });
    }
  });

  // Delete text submission
  app.delete("/api/text-submissions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteTextSubmission(id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ message: "Submission not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete submission" });
    }
  });

  // Delete answer sheet submission
  app.delete("/api/answer-sheets/submissions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteAnswerSheetSubmission(id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ message: "Submission not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete submission" });
    }
  });

  // Export answer sheet submissions to Excel
  app.get("/api/answer-sheets/:id/export-excel", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const session = await storage.getAnswerSheetSessionById(sessionId);
      if (!session) {
        res.status(404).json({ message: "Answer sheet not found" });
        return;
      }

      const submissions = await storage.getAnswerSheetSubmissionsBySessionId(sessionId);
      
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.default.Workbook();
      const worksheet = workbook.addWorksheet("提交紀錄");
      
      // Set columns
      worksheet.columns = [
        { header: "姓名", key: "name", width: 15 },
        { header: "班號", key: "number", width: 10 },
        { header: "原班", key: "originalClass", width: 10 },
        { header: "走班", key: "mixedClass", width: 12 },
        { header: "得分", key: "score", width: 10 },
        { header: "滿分", key: "maxScore", width: 10 },
        { header: "百分比", key: "percentage", width: 10 },
        { header: "提交時間", key: "submittedAt", width: 20 },
      ];
      
      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      
      // Add data rows
      for (const sub of submissions) {
        const percentage = Math.round((sub.totalScore / sub.maxScore) * 100);
        worksheet.addRow({
          name: sub.studentName,
          number: sub.studentNumber,
          originalClass: sub.originalClass,
          mixedClass: sub.mixedClass || "",
          score: sub.totalScore,
          maxScore: sub.maxScore,
          percentage: `${percentage}%`,
          submittedAt: new Date(sub.submittedAt).toLocaleString("zh-TW"),
        });
      }
      
      // Set response headers for Excel download
      const filename = encodeURIComponent(`${session.title}-提交紀錄.xlsx`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Export Excel error:", error);
      res.status(500).json({ message: "Failed to export Excel" });
    }
  });

  return httpServer;
}
