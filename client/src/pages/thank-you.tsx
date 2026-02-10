import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Trophy, Home, XCircle, CircleCheck } from "lucide-react";

interface QuestionResult {
  questionIndex: number;
  wordCorrect: boolean;
  posCorrect: boolean;
  meaningCorrect: boolean;
  earnedScore: number;
}

interface SentenceResult {
  sentenceId: number;
  earned: number;
  max: number;
  feedback: string;
}

interface SubmissionResult {
  totalScore: number;
  totalQuestions?: number;
  maxScore?: number;
  studentName: string;
  isTextDictation?: boolean;
  feedback?: string;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center overflow-hidden">
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
                <div className="bg-muted/30 rounded-lg p-4 text-left space-y-2">
                  <p className="text-sm text-muted-foreground font-medium mb-3">每題結果：</p>
                  {result.questionResults.map((qr) => {
                    const allCorrect = qr.wordCorrect && qr.posCorrect && qr.meaningCorrect;
                    return (
                      <div key={qr.questionIndex} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                        <span className="font-medium">單字 {qr.questionIndex}</span>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1" title="English Word">
                            {qr.wordCorrect 
                              ? <CircleCheck className="w-4 h-4 text-green-500" /> 
                              : <XCircle className="w-4 h-4 text-red-500" />}
                            <span className="text-xs text-muted-foreground">Word</span>
                          </span>
                          <span className="flex items-center gap-1" title="Part of Speech">
                            {qr.posCorrect 
                              ? <CircleCheck className="w-4 h-4 text-green-500" /> 
                              : <XCircle className="w-4 h-4 text-red-500" />}
                            <span className="text-xs text-muted-foreground">POS</span>
                          </span>
                          <span className="flex items-center gap-1" title="Chinese Meaning">
                            {qr.meaningCorrect 
                              ? <CircleCheck className="w-4 h-4 text-green-500" /> 
                              : <XCircle className="w-4 h-4 text-red-500" />}
                            <span className="text-xs text-muted-foreground">意思</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {isTextDictation && result.sentenceResults && result.sentenceResults.length > 0 && (
                <div className="bg-muted/30 rounded-lg p-4 text-left space-y-2">
                  <p className="text-sm text-muted-foreground font-medium mb-3">每句得分：</p>
                  {result.sentenceResults.map((sr, idx) => (
                    <div key={sr.sentenceId} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                      <span className="font-medium">第 {idx + 1} 句</span>
                      <div className="flex items-center gap-2">
                        {sr.earned === sr.max 
                          ? <CircleCheck className="w-4 h-4 text-green-500" />
                          : sr.earned >= sr.max * 0.6 
                            ? <CircleCheck className="w-4 h-4 text-yellow-500" />
                            : <XCircle className="w-4 h-4 text-red-500" />}
                        <span className={sr.earned === sr.max ? "text-green-600 dark:text-green-400" : sr.earned >= sr.max * 0.6 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}>
                          {sr.earned} / {sr.max} 分
                        </span>
                      </div>
                    </div>
                  ))}
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
