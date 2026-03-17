import nodemailer from "nodemailer";

interface ScoreEmailParams {
  to: string;
  studentName: string;
  examTitle: string;
  totalScore: number;
  maxScore: number;
  details?: string;
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

  const text = [
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

  await transporter.sendMail({
    from: SMTP_USER,
    to: params.to,
    subject: `[成績報告] ${params.examTitle}`,
    text,
  });

  console.log("Score email sent to", params.to);
}
