import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Trophy, Home, XCircle, CircleCheck } from "lucide-react";

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
}

interface SubmissionResult {
  totalScore: number;
  totalQuestions?: number;
  maxScore?: number;
  studentName: string;
  isTextDictation?: boolean;
  sentenceResults?: SentenceResult[];
  questionResults?: QuestionResult[];
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
    if (percentage >= 90) return "Excellent work!";
    if (percentage >= 80) return "Great job!";
    if (percentage >= 60) return "Good effort!";
    if (percentage >= 40) return "Keep practicing!";
    return "Don't give up!";
  };

  const CorrectIcon = () => <CircleCheck className="w-4 h-4 text-green-500 shrink-0" />;
  const WrongIcon = () => <XCircle className="w-4 h-4 text-red-500 shrink-0" />;

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
                  <p className="text-sm text-muted-foreground font-medium mb-2">答題詳情：</p>
                  {result.sentenceResults.map((sr, idx) => {
                    const isFullScore = sr.earned === sr.max;
                    const isPass = sr.earned >= sr.max * 0.6;
                    return (
                      <div key={sr.sentenceId} className={`rounded-md p-3 border ${isFullScore ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20" : isPass ? "border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-950/20" : "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"}`}>
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
                            </span>
                          </div>
                        </div>
                        {sr.studentSentence && (
                          <div className="text-sm mt-1">
                            <span className="text-muted-foreground">你的答案：</span>
                            <span className={isFullScore ? "text-foreground" : "text-red-600 dark:text-red-400"}>
                              {sr.studentSentence}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
