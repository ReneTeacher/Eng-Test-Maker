import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Trophy, Home } from "lucide-react";

interface SubmissionResult {
  totalScore: number;
  totalQuestions: number;
  studentName: string;
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
        // ignore
      }
    }
  }, []);

  const percentage = result ? Math.round((result.totalScore / result.totalQuestions) * 100) : 0;

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
          <h1 className="text-2xl font-bold text-foreground">Submission Complete!</h1>
        </div>
        
        <CardContent className="pt-8 pb-8 space-y-6">
          {result ? (
            <>
              <p className="text-muted-foreground">
                Thank you, <span className="font-semibold text-foreground">{result.studentName}</span>!
              </p>
              
              <div className="bg-muted/50 rounded-lg p-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Trophy className="w-6 h-6 text-yellow-500" />
                  <span className="text-lg font-medium">Your Score</span>
                </div>
                <div className={`text-5xl font-bold ${getScoreColor()} mb-1`}>
                  {result.totalScore} / {result.totalQuestions}
                </div>
                <div className="text-muted-foreground text-sm">
                  {percentage}% correct
                </div>
                <p className={`mt-3 font-medium ${getScoreColor()}`}>
                  {getScoreMessage()}
                </p>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Your answers have been submitted successfully.
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
            Return to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
