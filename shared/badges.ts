export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: "first_exam", name: "初試啼聲", description: "完成第一次考試", icon: "Star", color: "yellow" },
  { id: "perfect_score", name: "滿分達人", description: "任何考試取得滿分100分", icon: "Crown", color: "yellow" },
  { id: "high_achiever", name: "優秀學生", description: "任何考試取得90分以上", icon: "Award", color: "purple" },
  { id: "five_exams", name: "勤學不倦", description: "累計完成5次考試", icon: "BookOpen", color: "blue" },
  { id: "ten_exams", name: "考試達人", description: "累計完成10次考試", icon: "GraduationCap", color: "indigo" },
  { id: "three_streak", name: "三連勝", description: "連續3次考試取得80分以上", icon: "Flame", color: "orange" },
  { id: "improvement", name: "進步神速", description: "分數高於上一次考試", icon: "TrendingUp", color: "green" },
  { id: "vocab_master", name: "生字大師", description: "生字考試取得90分以上", icon: "BookText", color: "teal" },
  { id: "dictation_master", name: "聽寫大師", description: "聽寫考試取得90分以上", icon: "Headphones", color: "pink" },
  { id: "passing_all", name: "全部及格", description: "所有考試皆取得60分以上（至少3次）", icon: "ShieldCheck", color: "emerald" },
];

export interface SubmissionRecord {
  totalScore: number;
  examType: string;
  submittedAt: Date | string;
}

export function computeBadges(submissions: SubmissionRecord[]): string[] {
  if (submissions.length === 0) return [];

  const sorted = [...submissions].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );

  const earned: string[] = [];

  if (sorted.length >= 1) earned.push("first_exam");

  if (sorted.some(s => s.totalScore >= 100)) earned.push("perfect_score");

  if (sorted.some(s => s.totalScore >= 90)) earned.push("high_achiever");

  if (sorted.length >= 5) earned.push("five_exams");

  if (sorted.length >= 10) earned.push("ten_exams");

  for (let i = 2; i < sorted.length; i++) {
    if (sorted[i].totalScore >= 80 && sorted[i - 1].totalScore >= 80 && sorted[i - 2].totalScore >= 80) {
      earned.push("three_streak");
      break;
    }
  }

  if (sorted.length >= 2) {
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    if (last.totalScore > prev.totalScore) earned.push("improvement");
  }

  if (sorted.some(s => s.totalScore >= 90 && (s.examType === "vocab" || s.examType === "vocabulary"))) {
    earned.push("vocab_master");
  }

  if (sorted.some(s => s.totalScore >= 90 && s.examType === "text")) {
    earned.push("dictation_master");
  }

  if (sorted.length >= 3 && sorted.every(s => s.totalScore >= 60)) {
    earned.push("passing_all");
  }

  return earned;
}
