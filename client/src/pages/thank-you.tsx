import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Trophy, Home, XCircle, CircleCheck, Star, Crown, Award, BookOpen, GraduationCap, Flame, TrendingUp, BookText, Headphones, ShieldCheck, AlertTriangle, Lightbulb } from "lucide-react";
import { BADGE_DEFINITIONS, type BadgeDefinition } from "@shared/badges";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Star, Crown, Award, BookOpen, GraduationCap, Flame, TrendingUp, BookText, Headphones, ShieldCheck,
};

const colorMap: Record<string, string> = {
  yellow: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400",
  purple: "bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400",
  blue: "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400",
  indigo: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400",
  orange: "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400",
  green: "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400",
  teal: "bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400",
  pink: "bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400",
  emerald: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400",
};

interface QuestionResult {
  questionIndex: number;
  studentWord: string;
  studentPos: string;
  studentMeaning: string;
  wordCorrect: boolean;
  posCorrect: boolean;
  meaningCorrect: boolean;
  earnedScore: number;
}

interface SentenceResult {
  sentenceId: number;
  earned: number;
  max: number;
  studentSentence?: string;
  correctSentence?: string;
  feedback?: string;
}

interface SubmissionResult {
  totalScore: number;
  totalQuestions?: number;
  maxScore?: number;
  studentName: string;
  isTextDictation?: boolean;
  sentenceResults?: SentenceResult[];
  questionResults?: QuestionResult[];
  earnedBadges?: string[];
}

export default function ThankYou() {
  const [, navigate] = useLocation();
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("submissionResult");
    if (stored) {
      try {
        setResult(JSON.parse(stored));
      } catch {
      }
    }
  }, []);

  const isTextDictation = result?.isTextDictation;
  const maxPossible = 100;
  const percentage = result ? Math.round((result.totalScore / maxPossible) * 100) : 0;

  const getScoreColor = () => {
    if (percentage >= 80) return "text-green-600 dark:text-green-400";
    if (percentage >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreMessage = () => {
    if (percentage >= 90) return "表現非常出色！繼續保持！";
    if (percentage >= 80) return "做得很好！再接再厲！";
    if (percentage >= 60) return "不錯的表現，繼續努力！";
    if (percentage >= 40) return "加油！多練習一定會進步！";
    return "別灰心，下次一定更好！";
  };

  const CorrectIcon = () => <CircleCheck className="w-4 h-4 text-green-500 shrink-0" />;
  const WrongIcon = () => <XCircle className="w-4 h-4 text-red-500 shrink-0" />;

  const renderWordDiff = (correct: string, student: string) => {
    const correctWords = correct.split(/(\s+)/);
    const studentWords = student.split(/(\s+)/);
    const correctTokens = correctWords.filter(w => w.trim());
    const studentTokens = studentWords.filter(w => w.trim());

    return (
      <div className="space-y-1">
        <div>
          <span className="text-muted-foreground text-xs">正確：</span>
          <span className="text-green-700 dark:text-green-400 text-sm font-medium">{correct}</span>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">你寫：</span>
          <span className="text-sm">
            {studentTokens.map((word, i) => {
              const correctWord = correctTokens[i];
              const isMatch = correctWord && word.toLowerCase() === correctWord.toLowerCase();
              return (
                <span key={i}>
                  {i > 0 && " "}
                  <span className={isMatch ? "text-foreground" : "text-red-600 dark:text-red-400 font-medium underline decoration-wavy decoration-red-400 underline-offset-4"}>
                    {word}
                  </span>
                </span>
              );
            })}
            {studentTokens.length < correctTokens.length && (
              <span className="text-orange-500 dark:text-orange-400 text-xs ml-1">
                (漏寫 {correctTokens.length - studentTokens.length} 個字)
              </span>
            )}
            {studentTokens.length > correctTokens.length && (
              <span className="text-orange-500 dark:text-orange-400 text-xs ml-1">
                (多寫 {studentTokens.length - correctTokens.length} 個字)
              </span>
            )}
          </span>
        </div>
      </div>
    );
  };

  const earnedBadges: BadgeDefinition[] = (result?.earnedBadges || [])
    .map(id => BADGE_DEFINITIONS.find(b => b.id === id))
    .filter((b): b is BadgeDefinition => !!b);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 flex items-start justify-center p-4 pt-8">
      <Card className="max-w-lg w-full text-center overflow-hidden">
        <div className="bg-gradient-to-r from-primary/20 to-primary/10 py-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white dark:bg-card shadow-lg mb-4">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">已成功提交！</h1>
        </div>
        
        <CardContent className="pt-8 pb-8 space-y-6">
          {result ? (
            <>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{result.studentName}</span>，你的答案已提交。
              </p>
              
              <div className="bg-muted/50 rounded-lg p-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Trophy className="w-6 h-6 text-yellow-500" />
                  <span className="text-lg font-medium">你的分數</span>
                </div>
                <div className={`text-5xl font-bold ${getScoreColor()} mb-1`}>
                  {result.totalScore} / {maxPossible}
                </div>
                <div className="text-muted-foreground text-sm">
                  {percentage}%
                </div>
                <p className={`mt-3 font-medium ${getScoreColor()}`}>
                  {getScoreMessage()}
                </p>
              </div>

              {earnedBadges.length > 0 && (
                <div className="bg-muted/30 rounded-lg p-4 space-y-3" data-testid="section-earned-badges">
                  <p className="text-sm font-medium text-foreground flex items-center justify-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-500" />
                    獲得徽章
                  </p>
                  <div className="flex flex-wrap justify-center gap-4">
                    {earnedBadges.map((badge, idx) => {
                      const IconComp = iconMap[badge.icon];
                      return (
                        <div
                          key={badge.id}
                          className="badge-animate flex flex-col items-center gap-1.5 w-20"
                          style={{ animationDelay: `${idx * 0.15}s`, opacity: 0 }}
                          data-testid={`badge-earned-${badge.id}`}
                        >
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${colorMap[badge.color] || colorMap.yellow}`}>
                            {IconComp && <IconComp className="w-6 h-6" />}
                          </div>
                          <span className="text-xs font-medium text-foreground leading-tight">{badge.name}</span>
                          <span className="text-[10px] text-muted-foreground leading-tight text-center">{badge.description}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isTextDictation && result.questionResults && result.questionResults.length > 0 && (
                <div className="bg-muted/30 rounded-lg p-4 text-left space-y-3">
                  <p className="text-sm text-muted-foreground font-medium mb-2">答題詳情：</p>
                  {result.questionResults.map((qr) => {
                    const allCorrect = qr.wordCorrect && qr.posCorrect && qr.meaningCorrect;
                    return (
                      <div key={qr.questionIndex} className={`rounded-md p-3 border ${allCorrect ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20" : "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">單字 {qr.questionIndex}</span>
                          {allCorrect 
                            ? <span className="text-xs text-green-600 dark:text-green-400 font-medium">全對</span>
                            : <span className="text-xs text-red-600 dark:text-red-400 font-medium">有錯誤</span>}
                        </div>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex items-center gap-2">
                            {qr.wordCorrect ? <CorrectIcon /> : <WrongIcon />}
                            <span className="text-muted-foreground w-12 shrink-0">Word:</span>
                            <span className={qr.wordCorrect ? "text-foreground" : "text-red-600 dark:text-red-400 line-through"}>
                              {qr.studentWord || "(未填)"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {qr.posCorrect ? <CorrectIcon /> : <WrongIcon />}
                            <span className="text-muted-foreground w-12 shrink-0">POS:</span>
                            <span className={qr.posCorrect ? "text-foreground" : "text-red-600 dark:text-red-400 line-through"}>
                              {qr.studentPos || "(未填)"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {qr.meaningCorrect ? <CorrectIcon /> : <WrongIcon />}
                            <span className="text-muted-foreground w-12 shrink-0">意思:</span>
                            <span className={qr.meaningCorrect ? "text-foreground" : "text-red-600 dark:text-red-400 line-through"}>
                              {qr.studentMeaning || "(未填)"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {isTextDictation && result.sentenceResults && result.sentenceResults.length > 0 && (
                <div className="bg-muted/30 rounded-lg p-4 text-left space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BookText className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-medium">逐句分析：</p>
                  </div>
                  {result.sentenceResults.map((sr, idx) => {
                    const isFullScore = sr.earned === sr.max;
                    const isPass = sr.earned >= sr.max * 0.6;
                    const lostPoints = sr.max - sr.earned;
                    return (
                      <div key={sr.sentenceId} className={`rounded-md p-3 border ${isFullScore ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20" : isPass ? "border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-950/20" : "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"}`}
                        data-testid={`sentence-result-${idx}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">第 {idx + 1} 句</span>
                          <div className="flex items-center gap-2">
                            {isFullScore 
                              ? <CorrectIcon />
                              : isPass 
                                ? <CircleCheck className="w-4 h-4 text-yellow-500 shrink-0" />
                                : <WrongIcon />}
                            <span className={`text-sm font-medium ${isFullScore ? "text-green-600 dark:text-green-400" : isPass ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                              {sr.earned} / {sr.max} 分
                              {!isFullScore && <span className="text-xs ml-1 opacity-70">(-{lostPoints})</span>}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          {sr.correctSentence && sr.studentSentence && !isFullScore ? (
                            renderWordDiff(sr.correctSentence, sr.studentSentence)
                          ) : (
                            <>
                              {sr.correctSentence && (
                                <div>
                                  <span className="text-muted-foreground text-xs">正確：</span>
                                  <span className="text-green-700 dark:text-green-400 text-sm font-medium">
                                    {sr.correctSentence}
                                  </span>
                                </div>
                              )}
                              {sr.studentSentence && (
                                <div>
                                  <span className="text-muted-foreground text-xs">你寫：</span>
                                  <span className="text-foreground text-sm">{sr.studentSentence}</span>
                                </div>
                              )}
                            </>
                          )}
                          {sr.feedback && !isFullScore && (
                            <div className="mt-1.5 pt-2 border-t border-muted">
                              <div className="flex items-start gap-1.5">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                                <span className="text-foreground text-xs leading-relaxed">{sr.feedback}</span>
                              </div>
                            </div>
                          )}
                          {isFullScore && sr.feedback && (
                            <div className="flex items-start gap-1.5 mt-1">
                              <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                              <span className="text-green-700 dark:text-green-400 text-xs">{sr.feedback}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-2 pt-2 border-t border-muted text-center">
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const total = result.sentenceResults!.length;
                        const perfect = result.sentenceResults!.filter(s => s.earned === s.max).length;
                        const totalLost = result.sentenceResults!.reduce((sum, s) => sum + (s.max - s.earned), 0);
                        return `共 ${total} 句，滿分 ${perfect} 句，總共扣 ${totalLost} 分`;
                      })()}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              你的答案已成功提交。
            </p>
          )}

          <Button 
            onClick={() => {
              sessionStorage.removeItem("submissionResult");
              navigate("/");
            }}
            variant="outline"
            className="w-full"
            data-testid="button-return-home"
          >
            <Home className="w-4 h-4 mr-2" />
            返回主頁
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
