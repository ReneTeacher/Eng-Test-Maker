import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { examSubmissionSchema, createExamSchema, studentSubmissions, textSubmissions, exams } from "@shared/schema";
import ExcelJS from "exceljs";
import { computeBadges, BADGE_DEFINITIONS, type SubmissionRecord } from "@shared/badges";
import { db } from "./db";
import { and, eq } from "drizzle-orm";
import { sendScoreEmail } from "./email";

async function generateReportInBackground(submissionId: number, sessionId: number) {
  try {
    const session = await storage.getAnswerSheetSessionById(sessionId);
    if (!session) return;

    // Create report record
    const report = await storage.createStudentReport({ submissionId, sessionId, status: "generating", reportContent: "" });

    const apiKey = process.env.POE_API_KEY;
    if (!apiKey) {
      await storage.updateStudentReport(report.id, { status: "failed", reportContent: "AI 功能未啟用" });
      return;
    }

    // Get submission details
    const submissions = await storage.getAnswerSheetSubmissionsBySessionId(sessionId);
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) {
      await storage.updateStudentReport(report.id, { status: "failed", reportContent: "找不到提交記錄" });
      return;
    }

    // Parse questions and answers
    const items = JSON.parse(session.itemsJson);
    const answers = JSON.parse(submission.answersJson);

    // Build wrong answers list
    const allQuestions: { partName?: string; id: number; type: string; correct: string; studentAnswer: string }[] = [];
    const isPartFormat = Array.isArray(items) && items.length > 0 && 'partId' in items[0];

    if (isPartFormat) {
      for (const part of items) {
        for (const q of part.questions) {
          const key1 = `${part.partId}:${q.id}`;
          const key2 = String(q.id);
          const sa = answers[key1] || answers[key2] || "";
          allQuestions.push({ partName: part.partName, id: q.id, type: q.type, correct: q.correct, studentAnswer: String(sa) });
        }
      }
    } else {
      for (const q of items) {
        const sa = answers[String(q.id)] || "";
        allQuestions.push({ id: q.id, type: q.type, correct: q.correct, studentAnswer: String(sa) });
      }
    }

    const wrongAnswers = allQuestions.filter(q => q.correct.trim().toLowerCase() !== q.studentAnswer.trim().toLowerCase());
    const correctAnswers = allQuestions.filter(q => q.correct.trim().toLowerCase() === q.studentAnswer.trim().toLowerCase());

    // Build prompt
    let questionsText = "";
    for (const q of wrongAnswers) {
      const part = q.partName ? `[${q.partName}] ` : "";
      questionsText += `${part}Q${q.id}: Student answered "${q.studentAnswer || "(空白)"}", correct answer is "${q.correct}"\n`;
    }

    // Build AI message with optional analysis materials as images
    const contentParts: any[] = [];

    // Add analysis materials if available
    if (session.analysisMaterialsJson) {
      try {
        const materials = JSON.parse(session.analysisMaterialsJson);
        for (const mat of materials) {
          if (mat.base64Data && mat.mimeType) {
            contentParts.push({
              type: "image_url",
              image_url: { url: `data:${mat.mimeType};base64,${mat.base64Data}` }
            });
          }
        }
      } catch {}
    }

    contentParts.push({
      type: "text",
      text: `你是一位英語教師助手。請根據以下資料為學生撰寫個人化的學習分析報告。

## Student Info
Name: ${submission.studentName}
Score: ${submission.totalScore}/${submission.maxScore} (${Math.round((submission.totalScore / submission.maxScore) * 100)}%)
Correct: ${correctAnswers.length}/${allQuestions.length} questions

## Wrong Answers
${wrongAnswers.length === 0 ? "全部答對！" : questionsText}

${contentParts.length > 1 ? "## 上方圖片是教師提供的題目分析材料，請參考但不要直接照搬。" : ""}

## 要求
用中英混合撰寫（標題和建議用繁體中文，具體錯誤分析用英文），約 150-250 字：
1. 一句話總結表現
2. 分析錯題的知識點薄弱處（具體到哪些 grammar rules / vocabulary / reading skills）
3. 針對性改進建議
不要照搬教師筆記，要根據這位學生的具體錯誤模式做個人化分析。`
    });

    const botName = process.env.POE_BOT_NAME || "Claude-3.7-Sonnet";
    const aiResp = await fetch("https://api.poe.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: botName, messages: [{ role: "user", content: contentParts }], stream: false }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Report AI error:", aiResp.status, errText);
      await storage.updateStudentReport(report.id, { status: "failed", reportContent: "AI 生成失敗" });
      return;
    }

    const aiData = await aiResp.json();
    const reportText = (aiData.choices?.[0]?.message?.content as string) || "";

    await storage.updateStudentReport(report.id, { status: "completed", reportContent: reportText, completedAt: new Date() });
    console.log(`Report generated for submission ${submissionId}`);
  } catch (err: any) {
    console.error("Report generation error:", err?.message || err);
    try {
      const report = await storage.getStudentReportBySubmissionId(submissionId);
      if (report) {
        await storage.updateStudentReport(report.id, { status: "failed", reportContent: "生成過程出錯" });
      }
    } catch {}
  }
}

async function pdfToImages(pdfBuffer: Buffer): Promise<string[]> {
  const { pdf } = await import("pdf-to-img");
  const images: string[] = [];
  const doc = await pdf(pdfBuffer, { scale: 2 });
  for await (const page of doc) {
    images.push(Buffer.from(page).toString("base64"));
  }
  return images;
}

// AI sentence splitting for passage type
async function aiSplitPassage(text: string, apiKey: string): Promise<string[]> {
  const prompt = `請將以下文章按邏輯分割成評分單元，每個單元獨立一行輸出。
規則：
- 電郵：From/To/Subject/Date 等標題行各算一個單元；稱謂（Dear...）一個單元；每個正文段落一個單元；結束語（Yours sincerely 等）一個單元；署名一個單元
- 一般文章：每個完整句子或段落一個單元
只輸出各單元文字，一行一個，不加任何說明或編號。

文章：
${text}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_pro', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'abab6.5s-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const lines = content.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    if (lines.length > 0) return lines;
  } catch (error) {
    console.error("aiSplitPassage failed, using fallback:", error);
  }
  // Fallback: split by newlines
  return text.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
}

// MiniMax API helper function for AI scoring
async function callMiniMaxAI(prompt: string): Promise<{ isCorrect: boolean; feedback?: string }> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error("MINIMAX_API_KEY not configured");
    return { isCorrect: false };
  }

  try {
    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_pro', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'abab6.5s-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isCorrect: parsed.isCorrect ?? false,
        feedback: parsed.feedback
      };
    }
    return { isCorrect: false };
  } catch (error) {
    console.error("MiniMax AI API error:", error);
    return { isCorrect: false };
  }
}

async function aiMatchStudentToSentences(
  studentText: string,
  correctSentences: string[],
): Promise<string[]> {
  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) throw new Error("POE_API_KEY not configured");

  const botName = process.env.POE_BOT_NAME || "Gemini-3.1-Flash-Lite";
  const numbered = correctSentences.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const prompt = `You are matching a student's handwritten exam text (OCR'd) to ${correctSentences.length} reference sentences.

Reference sentences:
${numbered}

Student's full text:
---
${studentText}
---

TASK: For each reference sentence (1-${correctSentences.length}), find the corresponding part in the student's text. The student may have written extra content like their name, date, class, exam title - ignore those parts. Keep the student's EXACT original words including any spelling errors.

Return ONLY a JSON array of exactly ${correctSentences.length} strings. Index 0 = student's version of sentence 1, index 1 = sentence 2, etc. Use "" if the student didn't write that sentence.

JSON:`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("https://api.poe.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: botName,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content as string) || "";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length !== correctSentences.length) {
      throw new Error(`Array length mismatch: got ${parsed?.length}, expected ${correctSentences.length}`);
    }
    console.log("AI sentence matching succeeded");
    return parsed.map((s: any) => String(s || ""));
  } catch (error) {
    clearTimeout(timeout);
    console.error("aiMatchStudentToSentences failed:", error);
    throw error;
  }
}

function fallbackSequentialMatch(
  studentText: string,
  sentences: { correctSentence: string; maxScore: number }[],
): string[] {
  const words = studentText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter((w: string) => w.length > 0);
  let cursor = 0;
  const result: string[] = [];
  for (const s of sentences) {
    const count = s.correctSentence.split(/\s+/).filter((w: string) => w.length > 0).length;
    if (cursor >= words.length) { result.push(""); continue; }
    const take = Math.min(count, words.length - cursor);
    result.push(words.slice(cursor, cursor + take).join(' '));
    cursor += take;
  }
  return result;
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Temporary in-memory image store for Poe OCR (auto-cleaned after 10 minutes)
const tempImages = new Map<string, { data: Buffer; createdAt: number }>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, img] of tempImages.entries()) {
    if (img.createdAt < cutoff) tempImages.delete(id);
  }
}, 60000);

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

  // Serve temporary images for Poe OCR
  app.get("/api/temp-image/:id", (req, res) => {
    const img = tempImages.get(req.params.id);
    if (!img) { res.status(404).end(); return; }
    res.setHeader("Content-Type", "image/jpeg");
    res.send(img.data);
  });

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
      console.log("Fetching exams from database...");
      const exams = await storage.getExams();
      console.log(`Found ${exams.length} exams`);
      res.json(exams);
    } catch (error) {
      console.error("Error fetching exams:", error);
      res.status(500).json({ message: "Failed to fetch exams", error: error.message });
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
      const { title, vocabularies, correctText, isActive, examType, submissionMode } = req.body;

      if (!title || typeof title !== "string" || !title.trim()) {
        res.status(400).json({ message: "Title is required" });
        return;
      }

      const type = (examType === "text" || examType === "passage") ? examType : "vocab";
      const mode = submissionMode === "image" ? "image" : "text";

      if (type === "text" || type === "passage") {
        // Text Dictation / Passage Memorization exam
        if (!correctText || typeof correctText !== "string" || !correctText.trim()) {
          res.status(400).json({ message: "Correct text is required" });
          return;
        }

        // Split text into sentences
        let sentences: string[];
        if (type === "passage" && process.env.MINIMAX_API_KEY) {
          sentences = await aiSplitPassage(correctText.trim(), process.env.MINIMAX_API_KEY);
        } else {
          sentences = correctText.trim()
            .split(/(?<=[.!?。！？])\s*/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        }

        if (sentences.length === 0) {
          res.status(400).json({ message: "Could not parse any sentences from the text" });
          return;
        }

        const exam = await storage.createExam({
          title: title.trim(),
          isActive: isActive ?? false,
          examType: type,
          correctText: correctText.trim(),
          submissionMode: type === "passage" ? mode : "text",
        });

        // Create sentence records (distribute 100 points by word count ratio)
        const totalPoints = 100;
        const wordCounts = sentences.map((s: string) => s.split(/\s+/).filter((w: string) => w.length > 0).length);
        const totalWords = wordCounts.reduce((a: number, b: number) => a + b, 0);

        const rawScores = wordCounts.map((wc: number) => Math.max(1, Math.round((wc / totalWords) * totalPoints)));
        const rawSum = rawScores.reduce((a: number, b: number) => a + b, 0);
        if (rawSum !== totalPoints && rawScores.length > 0) {
          const maxIdx = rawScores.indexOf(Math.max(...rawScores));
          rawScores[maxIdx] += totalPoints - rawSum;
        }

        const sentenceData = sentences.map((sentence: string, index: number) => ({
          examId: exam.id,
          sentenceOrder: index + 1,
          correctSentence: sentence,
          maxScore: rawScores[index] || 1,
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

      // Full update for Text Dictation / Passage Memorization
      if ((currentExam.examType === "text" || currentExam.examType === "passage") && title && correctText) {
        const updated = await storage.updateExam(examId, { 
          title, 
          isActive: isActive ?? currentExam.isActive,
          correctText 
        });

        // Split text into sentences and redistribute 100 points
        let sentences: string[];
        if (currentExam.examType === "passage" && process.env.MINIMAX_API_KEY) {
          sentences = await aiSplitPassage(correctText.trim(), process.env.MINIMAX_API_KEY);
        } else {
          sentences = correctText.trim()
            .split(/(?<=[.!?。！？])\s*/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        }

        if (sentences.length > 0) {
          await storage.deleteTextSentencesByExamId(examId);
          const totalPoints = 100;
          const wordCounts = sentences.map((s: string) => s.split(/\s+/).filter((w: string) => w.length > 0).length);
          const totalWords = wordCounts.reduce((a: number, b: number) => a + b, 0);
          const rawScores = wordCounts.map((wc: number) => Math.max(1, Math.round((wc / totalWords) * totalPoints)));
          const rawSum = rawScores.reduce((a: number, b: number) => a + b, 0);
          if (rawSum !== totalPoints && rawScores.length > 0) {
            const maxIdx = rawScores.indexOf(Math.max(...rawScores));
            rawScores[maxIdx] += totalPoints - rawSum;
          }

          const sentenceData = sentences.map((sentence: string, index: number) => ({
            examId,
            sentenceOrder: index + 1,
            correctSentence: sentence,
            maxScore: rawScores[index] || 1,
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

                  const aiResult = await callMiniMaxAI(prompt);
                  if (aiResult.isCorrect) {
                    meaningCorrect = true;
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

                  const aiResult = await callMiniMaxAI(prompt);
                  console.log(`Re-score AI check: "${answer.studentMeaning}" vs "${question.correctMeaning}" => isCorrect: ${aiResult.isCorrect}`);
                  if (aiResult.isCorrect) {
                    meaningCorrect = true;
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
      const studentEmail = req.body.studentEmail as string | undefined;

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

              const aiResult = await callMiniMaxAI(prompt);
              console.log(`AI meaning check: "${answer.studentMeaning}" vs "${question.correctMeaning}" => isCorrect: ${aiResult.isCorrect}`);
              if (aiResult.isCorrect) {
                meaningCorrect = true;
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
        studentEmail,
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

      if (studentEmail) {
        const exam = await storage.getExamById(examId);
        sendScoreEmail({
          to: studentEmail,
          studentName,
          examTitle: exam?.title || "Vocabulary Dictation",
          totalScore: Math.round(totalScore),
          maxScore,
          vocabDetails: answerDetailsList.map((d, idx) => {
            const q = questions.find(qq => qq.id === d.questionId);
            return {
              index: idx + 1,
              correctWord: q?.correctWord || "",
              studentWord: d.studentWord,
              wordCorrect: d.wordCorrect,
              correctPos: q?.correctPos || "",
              studentPos: d.studentPos,
              posCorrect: d.posCorrect,
              correctMeaning: q?.correctMeaning || "",
              studentMeaning: d.studentMeaning,
              meaningCorrect: d.meaningCorrect,
              earned: d.earnedScore,
              max: (q?.wordScore || 0) + (q?.posScore || 0) + (q?.meaningScore || 0),
            };
          }),
        }).catch(err => console.error("Email send error:", err));
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

  function computeSentenceScore(correctSentence: string, studentSentence: string, maxScore: number) {
    if (!studentSentence.trim()) {
      return { earned: 0, deductions: maxScore, details: ["未填寫，扣全部 " + maxScore + " 分"] };
    }

    const normalizePunctuation = (s: string): string => {
      return s
        .replace(/[\u2013\u2014\u2015]/g, ' - ')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const splitHyphenatedWord = (word: string, referenceHyphenated: string[]): string[] => {
      const wordLower = word.toLowerCase();
      if (referenceHyphenated.some(ref => ref.toLowerCase() === wordLower)) {
        return [word];
      }
      for (const ref of referenceHyphenated) {
        const refLower = ref.toLowerCase();
        if (wordLower.startsWith(refLower + '-')) {
          const remainder = word.slice(ref.length + 1);
          const result = [word.slice(0, ref.length), '-'];
          if (remainder) result.push(remainder);
          return result;
        }
        if (wordLower.endsWith('-' + refLower)) {
          const prefix = word.slice(0, word.length - ref.length - 1);
          const result: string[] = [];
          if (prefix) result.push(prefix);
          result.push('-', word.slice(word.length - ref.length));
          return result;
        }
      }
      const parts = word.split('-');
      const result: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) result.push(parts[i]);
        if (i < parts.length - 1) result.push('-');
      }
      return result;
    };

    const tokenize = (s: string, referenceHyphenated?: string[]): string[] => {
      const norm = normalizePunctuation(s);
      const tokens: string[] = [];
      const regex = /[A-Za-z]+(?:['-][A-Za-z]+)*/g;
      let lastIdx = 0;
      let match;
      while ((match = regex.exec(norm)) !== null) {
        const between = norm.slice(lastIdx, match.index);
        for (const ch of between) {
          if (/[.,!?;:'"()\-\[\]{}]/.test(ch)) {
            tokens.push(ch);
          }
        }
        const word = match[0];
        if (word.includes('-') && referenceHyphenated && referenceHyphenated.length > 0) {
          const split = splitHyphenatedWord(word, referenceHyphenated);
          tokens.push(...split);
        } else {
          tokens.push(word);
        }
        lastIdx = regex.lastIndex;
      }
      const remaining = norm.slice(lastIdx);
      for (const ch of remaining) {
        if (/[.,!?;:'"()\-\[\]{}]/.test(ch)) {
          tokens.push(ch);
        }
      }
      return tokens;
    };

    const isPunc = (token: string): boolean => /^[.,!?;:'"()\-\[\]{}]$/.test(token);

    const allCorrectTokens = tokenize(correctSentence);
    const correctHyphenated = allCorrectTokens.filter(t => !isPunc(t) && t.includes('-'));
    const allStudentTokens = tokenize(studentSentence, correctHyphenated);

    const correctWords = allCorrectTokens.filter(t => !isPunc(t));
    const studentWords = allStudentTokens.filter(t => !isPunc(t));
    const correctWordsLower = correctWords.map(w => w.toLowerCase());
    const studentWordsLower = studentWords.map(w => w.toLowerCase());

    const correctPuncTokens = allCorrectTokens.filter(t => isPunc(t));
    const studentPuncTokens = allStudentTokens.filter(t => isPunc(t));

    const levenshtein = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      if (m === 0) return n;
      if (n === 0) return m;
      const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
          );
        }
      }
      return dp[m][n];
    };

    const lcsDP = (a: string[], b: string[]): number[][] => {
      const m = a.length, n = b.length;
      const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (a[i - 1] === b[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }
      return dp;
    };

    const dp = lcsDP(correctWordsLower, studentWordsLower);
    const matched: { ci: number; si: number }[] = [];
    let i = correctWordsLower.length, j = studentWordsLower.length;
    while (i > 0 && j > 0) {
      if (correctWordsLower[i - 1] === studentWordsLower[j - 1]) {
        matched.unshift({ ci: i - 1, si: j - 1 });
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    const matchedCorrectIdx = new Set(matched.map(m => m.ci));
    const matchedStudentIdx = new Set(matched.map(m => m.si));

    const unmatchedCorrect = correctWordsLower.map((_, idx) => idx).filter(idx => !matchedCorrectIdx.has(idx));
    const unmatchedStudent = studentWordsLower.map((_, idx) => idx).filter(idx => !matchedStudentIdx.has(idx));

    const typos: { student: string; correct: string; dist: number }[] = [];
    const pairedCorrect = new Set<number>();
    const pairedStudent = new Set<number>();

    const maxTypoDist = (word: string) => word.length <= 3 ? 1 : 2;

    const candidates: { cidx: number; sidx: number; dist: number; posDiff: number }[] = [];
    for (const cidx of unmatchedCorrect) {
      for (const sidx of unmatchedStudent) {
        const dist = levenshtein(correctWordsLower[cidx], studentWordsLower[sidx]);
        const threshold = maxTypoDist(correctWords[cidx]);
        if (dist > 0 && dist <= threshold) {
          candidates.push({ cidx, sidx, dist, posDiff: Math.abs(cidx - sidx) });
        }
      }
    }
    candidates.sort((a, b) => a.dist - b.dist || a.posDiff - b.posDiff);
    for (const c of candidates) {
      if (pairedCorrect.has(c.cidx) || pairedStudent.has(c.sidx)) continue;
      typos.push({ student: studentWords[c.sidx], correct: correctWords[c.cidx], dist: c.dist });
      pairedCorrect.add(c.cidx);
      pairedStudent.add(c.sidx);
    }

    const badlyMisspelled: { student: string; correct: string }[] = [];
    const remainingCorrect = unmatchedCorrect.filter(idx => !pairedCorrect.has(idx));
    const remainingStudent = unmatchedStudent.filter(idx => !pairedStudent.has(idx));

    if (remainingCorrect.length > 0 && remainingStudent.length > 0) {
      const posCandidates: { cidx: number; sidx: number; posDiff: number; dist: number }[] = [];
      for (const cidx of remainingCorrect) {
        for (const sidx of remainingStudent) {
          const posDiff = Math.abs(cidx - sidx);
          const dist = levenshtein(correctWordsLower[cidx], studentWordsLower[sidx]);
          posCandidates.push({ cidx, sidx, posDiff, dist });
        }
      }
      posCandidates.sort((a, b) => a.posDiff - b.posDiff || a.dist - b.dist);
      for (const pc of posCandidates) {
        if (pairedCorrect.has(pc.cidx) || pairedStudent.has(pc.sidx)) continue;
        const maxPosDiff = Math.max(3, Math.floor(correctWords.length * 0.3));
        if (pc.posDiff <= maxPosDiff) {
          badlyMisspelled.push({ student: studentWords[pc.sidx], correct: correctWords[pc.cidx] });
          pairedCorrect.add(pc.cidx);
          pairedStudent.add(pc.sidx);
        }
      }
    }

    const missingWords: string[] = [];
    for (const idx of unmatchedCorrect) {
      if (!pairedCorrect.has(idx)) {
        missingWords.push(correctWords[idx]);
      }
    }

    const extraWords: string[] = [];
    for (const idx of unmatchedStudent) {
      if (!pairedStudent.has(idx)) {
        extraWords.push(studentWords[idx]);
      }
    }

    let hasCaseError = false;
    for (const m of matched) {
      if (correctWords[m.ci] !== studentWords[m.si] && correctWordsLower[m.ci] === studentWordsLower[m.si]) {
        hasCaseError = true;
        break;
      }
    }

    const correctPuncStr = correctPuncTokens.join('');
    const studentPuncStr = studentPuncTokens.join('');
    const hasPuncError = correctPuncStr !== studentPuncStr;

    let totalDeductions = 0;
    const details: string[] = [];

    // Deduplicate typos by correct word (same misspelling only penalized once)
    const seenCorrect = new Set<string>();
    const allMisspelled = [
      ...typos.map(t => ({ student: t.student, correct: t.correct })),
      ...badlyMisspelled,
    ];
    for (const m of allMisspelled) {
      const key = m.correct.toLowerCase();
      if (seenCorrect.has(key)) continue;
      seenCorrect.add(key);
      totalDeductions += 1;
      details.push(`拼錯 "${m.student}"→"${m.correct}" -1分`);
    }
    if (missingWords.length > 0) {
      const d = missingWords.length;
      totalDeductions += d;
      details.push(`漏寫 ${missingWords.length} 個字 (${missingWords.map(w => `"${w}"`).join("、")}) -${d}分`);
    }
    if (extraWords.length > 0) {
      const d = extraWords.length;
      totalDeductions += d;
      details.push(`多寫 ${extraWords.length} 個字 (${extraWords.map(w => `"${w}"`).join("、")}) -${d}分`);
    }
    if (hasPuncError) {
      totalDeductions += 0.5;
      details.push(`標點符號錯誤 -0.5分`);
    }
    if (hasCaseError) {
      totalDeductions += 0.5;
      details.push(`大小寫錯誤 -0.5分`);
    }

    const rawScore = Math.max(0, maxScore - totalDeductions);
    const earned = Math.round(rawScore * 2) / 2;
    return { earned: Math.min(maxScore, earned), deductions: totalDeductions, details };
  }

  // OCR: Extract text from handwritten image using MiniMax VL
  app.post("/api/ocr-passage", async (req, res) => {
    const apiKey = process.env.POE_API_KEY;
    if (!apiKey) {
      res.status(400).json({ message: "圖片評分功能未啟用" });
      return;
    }

    const { images, imageBase64 } = req.body;
    // Support both single image (legacy) and multiple images
    const imageList: string[] = Array.isArray(images) ? images : (imageBase64 ? [imageBase64] : []);
    if (imageList.length === 0 || imageList.some(img => typeof img !== "string")) {
      res.status(400).json({ message: "Missing image data" });
      return;
    }
    if (imageList.length > 3) {
      res.status(400).json({ message: "最多只能上傳 3 張圖片" });
      return;
    }

    try {
      const botName = process.env.POE_BOT_NAME || "Claude-3.7-Sonnet";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const isMultiPage = imageList.length > 1;
      const imageContent = imageList.map(img => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${img}` },
      }));

      const prompt = isMultiPage
        ? `You are given ${imageList.length} photos of a student's handwritten dictation answer sheet. The pages may be in any order.

STEP 1: Determine the correct reading order by looking at the content continuity (sentences should flow naturally from one page to the next).
STEP 2: Transcribe ALL pages in the correct order as one continuous text.

IMPORTANT: This is a dictation answer sheet. Pages may have PRINTED headers at the top such as "Junior Three Dictation", "Name:", "Class:", "No:", "Date:", "Score:" or similar. IGNORE all printed/typed text completely. Only transcribe the student's HANDWRITTEN content.

STRICT RULES:
- Copy EVERY character exactly as written, including wrong spelling and wrong capitalization.
- If the student wrote "becuse", output "becuse" — do NOT correct it to "because".
- If the student wrote "the" in lowercase where uppercase is expected, keep it lowercase.
- Preserve ALL original punctuation exactly as written — do not add, remove, or change any comma, period, apostrophe, etc.
- If a punctuation mark is missing, do NOT add it.
- Preserve original line breaks as they appear on each page.
- Return ONLY the raw transcribed text in correct page order. No titles, labels, page numbers, explanations, or markdown formatting.`
        : `Transcribe this handwritten English image EXACTLY as the student wrote it.

IMPORTANT: This is a dictation answer sheet. The page may have PRINTED headers at the top such as "Junior Three Dictation", "Name:", "Class:", "No:", "Date:", "Score:" or similar. IGNORE all printed/typed text completely. Only transcribe the student's HANDWRITTEN content.

STRICT RULES:
- Copy EVERY character exactly as written, including wrong spelling and wrong capitalization.
- If the student wrote "becuse", output "becuse" — do NOT correct it to "because".
- If the student wrote "the" in lowercase where uppercase is expected, keep it lowercase.
- Preserve ALL original punctuation exactly as written — do not add, remove, or change any comma, period, apostrophe, etc.
- If a punctuation mark is missing, do NOT add it.
- Preserve original line breaks as they appear on the page.
- Return ONLY the raw transcribed text. No titles, labels, explanations, or markdown formatting.`;

      // Poe OpenAI-compatible API with base64 image(s)
      const response = await fetch("https://api.poe.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: botName,
          messages: [{
            role: "user",
            content: [
              ...imageContent,
              { type: "text", text: prompt },
            ],
          }],
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        console.error("Poe API error:", response.status, errText);
        res.status(400).json({ message: `OCR API 錯誤: ${errText}` });
        return;
      }

      const data = await response.json();
      console.log("Poe response:", JSON.stringify(data).slice(0, 200));
      let recognizedText = (data.choices?.[0]?.message?.content as string) || "";

      recognizedText = recognizedText.trim();
      if (!recognizedText) {
        res.status(400).json({ message: "無法辨識圖片內容，請確保圖片清晰" });
        return;
      }

      res.json({ recognizedText });
    } catch (err: any) {
      console.error("OCR error:", err?.message || err);
      if (err?.name === "AbortError") {
        res.status(400).json({ message: "圖片辨識逾時，請重試" });
      } else {
        res.status(400).json({ message: "圖片辨識失敗，請重試" });
      }
    }
  });

  // Submit Text Dictation (AI-scored) - supports sentence-by-sentence or full text mode
  app.post("/api/text-submissions", async (req, res) => {
    try {
      const { examId, studentName, studentNumber, originalClass, mixedClass, studentText, sentenceAnswers, studentEmail } = req.body;

      if (!examId || !studentName || !studentNumber || !originalClass || !mixedClass) {
        res.status(400).json({ message: "Missing required fields" });
        return;
      }

      // Get the exam to find the correct text
      const exam = await storage.getExamById(examId);
      if (!exam || (exam.examType !== "text" && exam.examType !== "passage")) {
        res.status(400).json({ message: "Invalid exam or not a text/passage exam" });
        return;
      }

      // Get sentences for this exam
      const sentences = await storage.getTextSentencesByExamId(examId);
      
      // Sentence-by-sentence mode
      if (sentenceAnswers && Array.isArray(sentenceAnswers) && sentences.length > 0) {
        let totalScore = 0;
        let maxScore = 0;
        const sentenceResults: { sentenceId: number; earned: number; max: number; feedback: string }[] = [];
        
        const scoringResults: { sentence: typeof sentences[0]; studentSentence: string; scoreResult: ReturnType<typeof computeSentenceScore> }[] = [];
        for (const sentence of sentences) {
          const answer = sentenceAnswers.find((a: { sentenceId: number; studentSentence: string }) => a.sentenceId === sentence.id);
          const studentSentence = answer?.studentSentence || "";
          maxScore += sentence.maxScore;
          const scoreResult = computeSentenceScore(sentence.correctSentence, studentSentence, sentence.maxScore);
          totalScore += scoreResult.earned;
          scoringResults.push({ sentence, studentSentence, scoreResult });
        }

        const feedbackPromises = scoringResults.map(async ({ sentence, studentSentence, scoreResult }) => {
          let sentenceFeedback = "";
          if (scoreResult.details.length === 0) {
            sentenceFeedback = "完全正確！非常好！";
          } else {
            sentenceFeedback = scoreResult.details.join("；") + `（共扣${scoreResult.deductions}分）`;
            try {
              const prompt = `你是英語聽寫考試的老師。以下是一位學生的聽寫結果，請根據扣分明細，用繁體中文給出簡短、有建設性的學習建議（不要重複扣分明細，只給建議）。控制在40字以內。

正確答案：${sentence.correctSentence}
學生答案：${studentSentence}
扣分明細：${scoreResult.details.join("；")}

只回覆建議文字，不要JSON。`;

              const apiKey = process.env.MINIMAX_API_KEY;
              if (apiKey) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                try {
                  const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_pro', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      model: 'abab6.5s-chat',
                      messages: [{ role: 'user', content: prompt }],
                      max_tokens: 200,
                      temperature: 0.3,
                    }),
                    signal: controller.signal,
                  });
                  clearTimeout(timeoutId);
                  
                  const data = await response.json();
                  const aiAdvice = (data.choices?.[0]?.message?.content || "").trim();
                  if (aiAdvice && aiAdvice.length < 100) {
                    sentenceFeedback += `。建議：${aiAdvice}`;
                  }
                } catch (fetchError: any) {
                  console.error("AI feedback fetch error:", fetchError?.message || fetchError);
                }
              }
            } catch (aiErr: any) {
              console.error("AI feedback error:", aiErr?.message || aiErr);
            }
          }
          return {
            sentenceId: sentence.id,
            earned: scoreResult.earned,
            max: sentence.maxScore,
            feedback: sentenceFeedback,
          };
        });

        const resolvedResults = await Promise.all(feedbackPromises);
        for (const r of resolvedResults) {
          sentenceResults.push(r);
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
        
        const finalTotalScore = Math.round(totalScore);

        // Save submission
        const submission = await storage.createTextSubmission({
          examId,
          studentName,
          studentNumber,
          originalClass,
          mixedClass,
          studentText: combinedText,
          totalScore: finalTotalScore,
          maxScore,
          feedback: sentenceResults.map((r, i) => `第${i + 1}句: ${Math.round(r.earned)}/${r.max}分`).join("; "),
          studentEmail,
        });

        // Save sentence answer details
        const answerDetails = sentenceResults.map((r, i) => ({
          submissionId: submission.id,
          sentenceId: r.sentenceId,
          studentSentence: sentenceAnswers.find((a: { sentenceId: number }) => a.sentenceId === r.sentenceId)?.studentSentence || "",
          earnedScore: Math.round(r.earned),
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

        if (studentEmail) {
          sendScoreEmail({
            to: studentEmail,
            studentName,
            examTitle: exam.title,
            totalScore: finalTotalScore,
            maxScore,
            sentenceDetails: sentenceResults.map((r, i) => {
              const sentence = sentences.find(s => s.id === r.sentenceId);
              return {
                index: i + 1,
                correct: sentence?.correctSentence || "",
                student: sentenceAnswers.find((a: { sentenceId: number }) => a.sentenceId === r.sentenceId)?.studentSentence || "",
                earned: Math.round(r.earned),
                max: r.max,
                feedback: r.feedback || "",
              };
            }),
          }).catch(err => console.error("Email send error:", err));
        }

        res.json({
          totalScore: finalTotalScore,
          maxScore,
          earnedBadges,
          sentenceResults: sentenceResults.map(r => {
            const sentence = sentences.find(s => s.id === r.sentenceId);
            return {
              sentenceId: r.sentenceId,
              earned: Math.round(r.earned),
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

      // Full text mode (passage memorization or legacy)
      if (!studentText) {
        res.status(400).json({ message: "Student text is required" });
        return;
      }


      if (!exam.correctText) {
        res.status(400).json({ message: "Exam has no correct text configured" });
        return;
      }

      const scoreResult = computeSentenceScore(exam.correctText, studentText, 100);
      let totalScore = Math.round(scoreResult.earned);
      let feedback = scoreResult.details.length === 0
        ? "完全正確！非常好！"
        : scoreResult.details.join("；");

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
        studentEmail,
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

      if (studentEmail) {
        sendScoreEmail({
          to: studentEmail,
          studentName,
          examTitle: exam.title,
          totalScore,
          maxScore: 100,
          correctText: exam.correctText,
          studentText,
          scoreDetails: scoreResult.details,
        }).catch(err => console.error("Email send error:", err));
      }

      res.json({
        totalScore,
        maxScore: 100,
        earnedBadges,
        studentName,
        correctSentence: exam.correctText,
        studentSentence: studentText,
        feedback,
        scoreDetails: scoreResult.details,
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

      // Text/Passage exams use textSubmissions table
      const isTextType = exam.examType === "text" || exam.examType === "passage";
      if (isTextType) {
        const textSubs = await storage.getTextSubmissionsByExamId(exam.id);
        const headers = ["Name", "Student Number", "Original Class", "Mixed Class", "Student Text", "Total Score", "Max Score", "Feedback", "Timestamp"];
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(exam.title.substring(0, 31));
        worksheet.addRow(headers);
        for (const sub of textSubs) {
          worksheet.addRow([
            sub.studentName, sub.studentNumber, sub.originalClass, sub.mixedClass,
            sub.studentText, sub.totalScore, sub.maxScore || 100, sub.feedback || "",
            new Date(sub.submittedAt).toLocaleString()
          ]);
        }
        worksheet.columns = headers.map(h => ({ width: Math.max(h.length, 15) }));
        const arrayBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${exam.title}-results.xlsx"`);
        res.send(Buffer.from(arrayBuffer));
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

  // Re-score all text submissions for an exam
  app.post("/api/exams/:id/rescore", async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const exam = await storage.getExamById(examId);
      if (!exam) {
        res.status(404).json({ message: "Exam not found" });
        return;
      }

      let rescored = 0;

      if (exam.examType === "text") {
        const sentences = await storage.getTextSentencesByExamId(examId);
        if (sentences.length === 0) {
          res.status(400).json({ message: "No sentences found for this exam" });
          return;
        }

        const submissions = await storage.getTextSubmissionsByExamId(examId);

        for (const submission of submissions) {
          const answerDetails = await storage.getTextAnswerDetailsBySubmissionId(submission.id);
          if (answerDetails.length === 0) continue;

          let totalScore = 0;
          
          for (const detail of answerDetails) {
            const sentence = sentences.find(s => s.id === detail.sentenceId);
            if (!sentence) continue;
            
            const scoreResult = computeSentenceScore(sentence.correctSentence, detail.studentSentence, sentence.maxScore);
            const earnedScore = scoreResult.earned;
            
            let sentenceFeedback = "";
            if (scoreResult.details.length === 0) {
              sentenceFeedback = "完全正確！非常好！";
            } else {
              sentenceFeedback = scoreResult.details.join("；") + `（共扣${scoreResult.deductions}分）`;
            }
            
            totalScore += earnedScore;
            
            await storage.updateTextAnswerDetail(detail.id, {
              earnedScore: Math.round(earnedScore),
              feedback: sentenceFeedback,
            });
          }
          
          const finalTotalScore = Math.round(totalScore);
          await storage.updateTextSubmissionScore(submission.id, finalTotalScore);
          
          const updatedDetails = await storage.getTextAnswerDetailsBySubmissionId(submission.id);
          const feedbackSummary = updatedDetails.map((d, i) => {
            const sent = sentences.find(s => s.id === d.sentenceId);
            return `第${i + 1}句: ${d.earnedScore}/${sent?.maxScore || 0}分`;
          }).join("; ");
          await db.update(textSubmissions).set({ feedback: feedbackSummary }).where(eq(textSubmissions.id, submission.id));
          
          rescored++;
        }
      } else {
        const questions = await storage.getQuestionsByExamId(examId);
        const submissions = await storage.getSubmissionsByExamId(examId);

        for (const sub of submissions) {
          const answers = await storage.getAnswerDetailsBySubmissionId(sub.id);
          let newTotalScore = 0;

          for (const answer of answers) {
            const question = questions.find(q => q.id === answer.questionId);
            if (!question) continue;

            const wordCorrect = answer.studentWord?.trim().toLowerCase() === question.correctWord.trim().toLowerCase();
            const posCorrect = answer.studentPos?.trim().toLowerCase() === question.correctPos.trim().toLowerCase();
            
            let meaningCorrect = false;
            const studentMeaning = (answer.studentMeaning || "").trim();
            const correctMeaning = (question.correctMeaning || "").trim();
            if (studentMeaning === correctMeaning) {
              meaningCorrect = true;
            } else {
              const normStudent = convertSimplifiedToTraditional(normalizeChinese(studentMeaning));
              const normCorrect = convertSimplifiedToTraditional(normalizeChinese(correctMeaning));
              meaningCorrect = normStudent === normCorrect;
            }

            const isCorrect = wordCorrect && posCorrect && meaningCorrect;
            let wordScore = wordCorrect ? (question.wordScore || 0) : 0;
            let posScore = posCorrect ? (question.posScore || 0) : 0;
            let meaningScore = meaningCorrect ? (question.meaningScore || 0) : 0;
            const totalPartScore = wordScore + posScore + meaningScore;
            newTotalScore += totalPartScore;

            await storage.updateAnswerDetail(answer.id, {
              isCorrect,
              earnedScore: totalPartScore,
            });
          }

          await db.update(studentSubmissions).set({ totalScore: newTotalScore }).where(eq(studentSubmissions.id, sub.id));
          rescored++;
        }
      }

      res.json({ message: `已重新批改 ${rescored} 份提交`, rescored });
    } catch (error) {
      console.error("Rescore error:", error);
      res.status(500).json({ message: "重新批改失敗" });
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

      // Fire and forget: generate personalized report in background
      generateReportInBackground(submission.id, sessionId).catch(console.error);

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

  // Upload analysis materials for an answer sheet
  app.post("/api/answer-sheets/:id/analysis-materials", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.getAnswerSheetSessionById(id);
      if (!session) {
        res.status(404).json({ message: "Answer sheet not found" });
        return;
      }

      const { materials } = req.body; // [{ filename, base64Data, mimeType }]
      if (!Array.isArray(materials) || materials.length === 0) {
        res.status(400).json({ message: "No materials provided" });
        return;
      }
      if (materials.length > 3) {
        res.status(400).json({ message: "最多上傳 3 個檔案" });
        return;
      }

      const existing = session.analysisMaterialsJson ? JSON.parse(session.analysisMaterialsJson) : [];
      const combined = [...existing, ...materials].slice(0, 3);

      await storage.updateAnswerSheetSession(id, { analysisMaterialsJson: JSON.stringify(combined) } as any);
      res.json({ success: true, count: combined.length });
    } catch (error) {
      console.error("Upload analysis materials error:", error);
      res.status(500).json({ message: "Failed to upload analysis materials" });
    }
  });

  // Delete a specific analysis material by index
  app.delete("/api/answer-sheets/:id/analysis-materials/:index", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const index = parseInt(req.params.index);
      const session = await storage.getAnswerSheetSessionById(id);
      if (!session) {
        res.status(404).json({ message: "Answer sheet not found" });
        return;
      }

      const materials = session.analysisMaterialsJson ? JSON.parse(session.analysisMaterialsJson) : [];
      if (index < 0 || index >= materials.length) {
        res.status(400).json({ message: "Invalid index" });
        return;
      }

      materials.splice(index, 1);
      await storage.updateAnswerSheetSession(id, { analysisMaterialsJson: JSON.stringify(materials) } as any);
      res.json({ success: true, count: materials.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete analysis material" });
    }
  });

  // Get student report for a submission
  app.get("/api/answer-sheets/submissions/:submissionId/report", async (req, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const report = await storage.getStudentReportBySubmissionId(submissionId);
      if (!report) {
        res.json({ status: "none" });
        return;
      }
      res.json({ status: report.status, content: report.reportContent, completedAt: report.completedAt });
    } catch (error) {
      res.status(500).json({ message: "Failed to get report" });
    }
  });

  // Regenerate student report
  app.post("/api/answer-sheets/submissions/:submissionId/regenerate-report", async (req, res) => {
    try {
      const submissionId = parseInt(req.params.submissionId);
      const report = await storage.getStudentReportBySubmissionId(submissionId);
      if (report) {
        await storage.updateStudentReport(report.id, { status: "pending", reportContent: "", completedAt: null as any });
      }
      // Need sessionId — look up from submission
      const allSessions = await storage.getAnswerSheetSessions();
      let sessionId: number | null = null;
      for (const sess of allSessions) {
        const subs = await storage.getAnswerSheetSubmissionsBySessionId(sess.id);
        if (subs.some(s => s.id === submissionId)) {
          sessionId = sess.id;
          break;
        }
      }
      if (sessionId) {
        generateReportInBackground(submissionId, sessionId).catch(console.error);
      }
      res.json({ status: "pending" });
    } catch (error) {
      res.status(500).json({ message: "Failed to regenerate report" });
    }
  });

  // AI: Extract question structure from PDF images (sent as base64 from frontend)
  app.post("/api/answer-sheets/extract-from-pdf", async (req, res) => {
    const apiKey = process.env.POE_API_KEY;
    if (!apiKey) {
      res.status(400).json({ message: "AI 功能未啟用（缺少 POE_API_KEY）" });
      return;
    }

    const { imageBase64Arr } = req.body; // Array of base64 image strings from frontend
    if (!Array.isArray(imageBase64Arr) || imageBase64Arr.length === 0) {
      res.status(400).json({ message: "請上傳試卷圖片" });
      return;
    }

    try {
      // Send images to Poe Vision API for question extraction
      const botName = process.env.POE_BOT_NAME || "Claude-3.7-Sonnet";
      const contentParts: any[] = imageBase64Arr.slice(0, 5).map((b64: string) => ({
        type: "image_url",
        image_url: { url: b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}` }
      }));
      contentParts.push({
        type: "text",
        text: `Analyze this exam paper. Extract the question structure as JSON.

For each section/part:
- Identify the part name (e.g. "Part A: Multiple Choice")
- For MC questions: question number, type "mc", options array (e.g. ["A","B","C","D"])
- For fill-in-the-blank/short answer: question number, type "text"
- Do NOT extract correct answers

Return ONLY valid JSON array, no explanation:
[{"partName":"Part A: ...","questions":[{"id":1,"type":"mc","options":["A","B","C","D"]},{"id":2,"type":"text"}]}]`
      });

      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), 25000);
      const aiResp = await fetch("https://api.poe.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: botName, messages: [{ role: "user", content: contentParts }], stream: false }),
        signal: aiController.signal,
      });
      clearTimeout(aiTimeout);

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error("Poe API error (extract):", aiResp.status, errText);
        res.status(400).json({ message: "AI 分析失敗，請重試" });
        return;
      }

      const aiData = await aiResp.json();
      let rawText = (aiData.choices?.[0]?.message?.content as string) || "";
      // Extract JSON from response (might be wrapped in markdown code block)
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        res.status(400).json({ message: "AI 無法提取題目結構，請重試或手動輸入", rawResponse: rawText });
        return;
      }

      const extracted = JSON.parse(jsonMatch[0]);
      res.json({ parts: extracted });
    } catch (err: any) {
      console.error("Extract from PDF error:", err?.message || err);
      if (err?.name === "AbortError") {
        res.status(400).json({ message: "操作逾時，請重試" });
      } else {
        res.status(400).json({ message: "PDF 分析失敗：" + (err?.message || "未知錯誤") });
      }
    }
  });

  return httpServer;
}
