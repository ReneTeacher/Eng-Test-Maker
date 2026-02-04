import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BookOpen, Send, AlertCircle, User, ClipboardList } from "lucide-react";
import type { ExamWithQuestions, StudentLogin } from "@shared/schema";

export default function StudentExam() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [studentInfo, setStudentInfo] = useState<StudentLogin | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("studentInfo");
    if (!stored) {
      navigate("/");
      return;
    }
    try {
      setStudentInfo(JSON.parse(stored));
    } catch {
      navigate("/");
    }
  }, [navigate]);

  const { data: activeExam, isLoading, error } = useQuery<ExamWithQuestions>({
    queryKey: ["/api/exams/active"],
    enabled: !!studentInfo,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: { 
      examId: number; 
      answers: { questionId: number; studentAnswer: string }[] 
    }) => {
      const response = await apiRequest("POST", "/api/submissions", {
        ...studentInfo,
        examId: data.examId,
        answers: data.answers,
      });
      return response.json();
    },
    onSuccess: (data) => {
      sessionStorage.setItem("submissionResult", JSON.stringify(data));
      sessionStorage.removeItem("studentInfo");
      navigate("/thank-you");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Submission Failed", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleAnswerChange = (questionId: number, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!activeExam) return;

    const submissionAnswers = activeExam.questions.map(q => ({
      questionId: q.id,
      studentAnswer: answers[q.id]?.trim() || "",
    }));

    submitMutation.mutate({
      examId: activeExam.id,
      answers: submissionAnswers,
    });
  };

  if (!studentInfo) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !activeExam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No Active Test</h2>
            <p className="text-muted-foreground mb-6">
              There is no dictation test available at the moment. Please check with your teacher.
            </p>
            <Button onClick={() => navigate("/")} variant="outline" data-testid="button-go-back">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
            <BookOpen className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">{activeExam.title}</h1>
          <p className="text-muted-foreground text-sm">
            {activeExam.questions.length} {activeExam.questions.length === 1 ? "word" : "words"} to complete
          </p>
        </div>

        <Card className="mb-4 bg-muted/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{studentInfo.studentName}</span>
              </div>
              <div className="text-muted-foreground">#{studentInfo.studentNumber}</div>
              <div className="text-muted-foreground">{studentInfo.originalClass}</div>
              <div className="text-muted-foreground hidden sm:block">{studentInfo.mixedClass}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Dictation Test
            </CardTitle>
            <CardDescription>
              Listen carefully and type each word or sentence correctly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {activeExam.questions
                .sort((a, b) => a.wordOrder - b.wordOrder)
                .map((question, index) => (
                  <div key={question.id} className="space-y-2">
                    <Label 
                      htmlFor={`answer-${question.id}`}
                      className="text-base font-medium flex items-center gap-2"
                    >
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-semibold">
                        {index + 1}
                      </span>
                      Word {index + 1}
                    </Label>
                    <Input
                      id={`answer-${question.id}`}
                      data-testid={`input-answer-${index + 1}`}
                      placeholder="Type your answer here"
                      value={answers[question.id] || ""}
                      onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="h-12 text-base"
                    />
                  </div>
                ))}

              <div className="pt-4">
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-medium"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-exam"
                >
                  {submitMutation.isPending ? (
                    "Submitting..."
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Answers
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
