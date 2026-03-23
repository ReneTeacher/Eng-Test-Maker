import nodemailer from "nodemailer";

interface SentenceDetail {
  index: number;
  correct: string;
  student: string;
  earned: number;
  max: number;
  feedback: string;
}

interface VocabDetail {
  index: number;
  correctWord: string;
  studentWord: string;
  wordCorrect: boolean;
  correctPos: string;
  studentPos: string;
  posCorrect: boolean;
  correctMeaning: string;
  studentMeaning: string;
  meaningCorrect: boolean;
  earned: number;
  max: number;
}

interface ScoreEmailParams {
  to: string;
  studentName: string;
  examTitle: string;
  totalScore: number;
  maxScore: number;
  details?: string;
  sentenceDetails?: SentenceDetail[];
  vocabDetails?: VocabDetail[];
  correctText?: string;
  studentText?: string;
  scoreDetails?: string[];
}

function mark(ok: boolean) { return ok ? " [CORRECT]" : " [WRONG]"; }

function buildSentenceReport(params: ScoreEmailParams): string {
  const lines: string[] = [];
  const pct = Math.round((params.totalScore / params.maxScore) * 100);

  lines.push(`${params.studentName} 同學你好，`);
  lines.push("");
  lines.push(`你的「${params.examTitle}」成績報告如下：`);
  lines.push("");
  lines.push(`總得分：${params.totalScore} / ${params.maxScore} (${pct}%)`);
  lines.push("");
  lines.push("━━━ 逐句對照 ━━━");

  for (const s of params.sentenceDetails!) {
    const full = s.earned === s.max;
    lines.push("");
    lines.push(`第${s.index}句 [${Math.round(s.earned)}/${s.max}]${full ? "" : " ✗"}`);
    lines.push(`  正確：${s.correct}`);
    lines.push(`  你寫：${s.student || "(未作答)"}`);
    if (s.feedback) lines.push(`  評語：${s.feedback}`);
  }

  const missed = params.sentenceDetails!.filter(s => s.earned < s.max * 0.6);
  if (missed.length > 0) {
    lines.push("");
    lines.push("━━━ 學習建議 ━━━");
    lines.push(`- 共 ${missed.length} 句得分率低於60%，建議重點複習`);
    lines.push("- 漏寫的句子建議抄寫3遍加深記憶");
    if (pct < 60) lines.push("- 整體得分率偏低，建議完整重讀課文後再次默寫練習");
  }

  lines.push("");
  lines.push(`提交時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Macau" })}`);
  lines.push("");
  lines.push("此郵件由系統自動發送，請勿回覆。");
  return lines.join("\n");
}

function buildVocabReport(params: ScoreEmailParams): string {
  const lines: string[] = [];
  const pct = Math.round((params.totalScore / params.maxScore) * 100);

  lines.push(`${params.studentName} 同學你好，`);
  lines.push("");
  lines.push(`你的「${params.examTitle}」成績報告如下：`);
  lines.push("");
  lines.push(`總得分：${params.totalScore} / ${params.maxScore} (${pct}%)`);
  lines.push("");
  lines.push("━━━ 逐題對照 ━━━");

  for (const v of params.vocabDetails!) {
    const full = v.earned === v.max;
    lines.push("");
    lines.push(`Q${v.index} [${v.earned}/${v.max}]${full ? "" : " ✗"}`);
    if (full) {
      lines.push(`  單詞：${v.studentWord} | 詞性：${v.studentPos} | 中文：${v.studentMeaning}`);
    } else {
      if (!v.wordCorrect) {
        lines.push(`  單詞：你寫「${v.studentWord || "(空)"}」→ 正確「${v.correctWord}」`);
      } else {
        lines.push(`  單詞：${v.studentWord}${mark(true)}`);
      }
      if (!v.posCorrect) {
        lines.push(`  詞性：你寫「${v.studentPos || "(空)"}」→ 正確「${v.correctPos}」`);
      } else {
        lines.push(`  詞性：${v.studentPos}${mark(true)}`);
      }
      if (!v.meaningCorrect) {
        lines.push(`  中文：你寫「${v.studentMeaning || "(空)"}」→ 正確「${v.correctMeaning}」`);
      } else {
        lines.push(`  中文：${v.studentMeaning}${mark(true)}`);
      }
    }
  }

  const wrongCount = params.vocabDetails!.filter(v => v.earned < v.max).length;
  if (wrongCount > 0) {
    lines.push("");
    lines.push("━━━ 學習建議 ━━━");
    lines.push(`- 共 ${wrongCount} 題有錯誤，建議重點複習錯誤的詞彙`);
    lines.push("- 拼寫錯誤的單詞建議抄寫5遍");
    if (pct < 60) lines.push("- 整體得分率偏低，建議重新背誦整個單元的詞彙");
  }

  lines.push("");
  lines.push(`提交時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Macau" })}`);
  lines.push("");
  lines.push("此郵件由系統自動發送，請勿回覆。");
  return lines.join("\n");
}

function buildPassageReport(params: ScoreEmailParams): string {
  const lines: string[] = [];
  const pct = Math.round((params.totalScore / params.maxScore) * 100);

  lines.push(`${params.studentName} 同學你好，`);
  lines.push("");
  lines.push(`你的「${params.examTitle}」成績報告如下：`);
  lines.push("");
  lines.push(`總得分：${params.totalScore} / ${params.maxScore} (${pct}%)`);
  lines.push("");
  lines.push("━━━ 正確答案 ━━━");
  lines.push(params.correctText!);
  lines.push("");
  lines.push("━━━ 你的答案 ━━━");
  lines.push(params.studentText || "(未作答)");

  if (params.scoreDetails && params.scoreDetails.length > 0) {
    lines.push("");
    lines.push("━━━ 扣分明細 ━━━");
    for (const d of params.scoreDetails) {
      lines.push(`  - ${d}`);
    }
  }

  if (pct < 60) {
    lines.push("");
    lines.push("━━━ 學習建議 ━━━");
    lines.push("- 整體得分率偏低，建議完整重讀課文後再次默寫練習");
    lines.push("- 拼寫錯誤的單詞建議抄寫5遍加深記憶");
  }

  lines.push("");
  lines.push(`提交時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Macau" })}`);
  lines.push("");
  lines.push("此郵件由系統自動發送，請勿回覆。");
  return lines.join("\n");
}

function buildSimpleReport(params: ScoreEmailParams): string {
  return [
    `${params.studentName} 同學你好，`,
    "",
    `你的「${params.examTitle}」成績報告如下：`,
    "",
    `得分：${params.totalScore} / ${params.maxScore}`,
    params.details ? `\n${params.details}` : "",
    "",
    `提交時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Macau" })}`,
    "",
    "此郵件由系統自動發送，請勿回覆。",
  ].join("\n");
}

export async function sendScoreEmail(params: ScoreEmailParams) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log("SMTP not configured, skipping email to", params.to);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587"),
    secure: (SMTP_PORT || "587") === "465",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  let text: string;
  if (params.correctText && params.studentText !== undefined) {
    text = buildPassageReport(params);
  } else if (params.sentenceDetails && params.sentenceDetails.length > 0) {
    text = buildSentenceReport(params);
  } else if (params.vocabDetails && params.vocabDetails.length > 0) {
    text = buildVocabReport(params);
  } else {
    text = buildSimpleReport(params);
  }

  await transporter.sendMail({
    from: SMTP_USER,
    to: params.to,
    subject: `[成績報告] ${params.examTitle} - ${params.totalScore}/${params.maxScore}`,
    text,
  });

  console.log("Score email sent to", params.to);
}
