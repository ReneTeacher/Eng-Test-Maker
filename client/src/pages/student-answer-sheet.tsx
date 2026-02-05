import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink, Send, CheckCircle2, XCircle, User } from "lucide-react";
import type { AnswerSheetSession, QuestionItem } from "@shared/schema";

export default function StudentAnswerSheet() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [originalClass, setOriginalClass] = useState("");
  
  // Answer state
  const [answers, setAnswers] = useState<Record<number, string>>({});
  
  // Result state
  const [result, setResult] = useState<{ totalScore: number; maxScore: number; percentage: number } | null>(null);

  // Fetch answer sheet data
  const { data: session, isLoading, error } = useQuery<AnswerSheetSession>({
    queryKey: ["/api/answer-sheets", id],
    queryFn: async () => {
      const res = await fetch(`/api/answer-sheets/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  const items: QuestionItem[] = session ? JSON.parse(session.itemsJson) : [];

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/answer-sheets/${id}/submit`, {
        studentName,
        studentNumber: parseInt(studentNumber),
        originalClass,
        answers,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "提交成功" });
    },
    onError: () => {
      toast({ title: "提交失敗", variant: "destructive" });
    },
  });

  // Handle login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !studentNumber || !originalClass) {
      toast({ title: "請填寫所有欄位", variant: "destructive" });
      return;
    }
    setIsLoggedIn(true);
  };

  // Handle MC selection
  const selectMcAnswer = (questionId: number, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  // Handle text input
  const setTextAnswer = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  // Handle submit
  const handleSubmit = () => {
    const unanswered = items.filter((item) => !answers[item.id]);
    if (unanswered.length > 0) {
      if (!confirm(`還有 ${unanswered.length} 題未作答，確定要提交嗎？`)) {
        return;
      }
    }
    submitMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">載入中...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive">找不到此答案卷</p>
            <Button className="mt-4" onClick={() => navigate("/")}>返回首頁</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show result
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle>考試結果</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="text-6xl font-bold text-primary">
              {result.totalScore} / {result.maxScore}
            </div>
            <div className="text-2xl text-muted-foreground">
              {result.percentage}%
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">學生: {studentName}</p>
              <p className="text-sm text-muted-foreground">學號: {studentNumber}</p>
              <p className="text-sm text-muted-foreground">班級: {originalClass}</p>
            </div>
            
            {/* Show answers comparison */}
            <div className="mt-6 text-left max-h-64 overflow-y-auto border rounded-md p-3">
              {items.map((item) => {
                const studentAnswer = answers[item.id] || "(未作答)";
                const isCorrect = studentAnswer.toLowerCase().trim() === item.correct.toLowerCase().trim();
                return (
                  <div key={item.id} className="flex items-center gap-2 py-1 border-b last:border-0">
                    <span className="w-8 text-muted-foreground">Q{item.id}</span>
                    {isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className={isCorrect ? "text-green-600" : "text-red-600"}>
                      {studentAnswer}
                    </span>
                    {!isCorrect && (
                      <span className="text-muted-foreground text-sm">
                        (正確: {item.correct})
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show login form
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle>{session.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="name">姓名</Label>
                <Input
                  id="name"
                  placeholder="請輸入姓名"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  autoComplete="off"
                  data-testid="input-student-name"
                />
              </div>
              <div>
                <Label htmlFor="number">學號 (1-40)</Label>
                <Input
                  id="number"
                  type="number"
                  min={1}
                  max={40}
                  placeholder="請輸入學號"
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                  autoComplete="off"
                  data-testid="input-student-number"
                />
              </div>
              <div>
                <Label htmlFor="class">班級</Label>
                <Select value={originalClass} onValueChange={setOriginalClass}>
                  <SelectTrigger data-testid="select-class">
                    <SelectValue placeholder="選擇班級" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="J3A">J3A</SelectItem>
                    <SelectItem value="J3B">J3B</SelectItem>
                    <SelectItem value="J3C">J3C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" data-testid="button-login">
                <User className="h-4 w-4 mr-2" />
                開始作答
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show answer form (iPad-optimized split screen)
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{session.title}</h1>
            <p className="text-sm text-muted-foreground">{studentName} ({originalClass})</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.open(session.paperLink, "_blank")}
              data-testid="button-view-paper"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              查看試卷
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              data-testid="button-submit"
            >
              <Send className="h-4 w-4 mr-2" />
              提交答案
            </Button>
          </div>
        </div>
      </div>

      {/* Answer Form */}
      <div className="max-w-4xl mx-auto p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="relative">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                    {item.id}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    item.type === "mc" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  }`}>
                    {item.type === "mc" ? "MC" : "填充"}
                  </span>
                </div>

                {item.type === "mc" && item.options ? (
                  <div className="flex flex-wrap gap-2">
                    {item.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => selectMcAnswer(item.id, option)}
                        className={`w-12 h-12 rounded-full border-2 font-bold text-lg transition-all ${
                          answers[item.id] === option
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground border-border hover:border-primary/50"
                        }`}
                        data-testid={`button-option-${item.id}-${option}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Input
                    placeholder="輸入答案"
                    value={answers[item.id] || ""}
                    onChange={(e) => setTextAnswer(item.id, e.target.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-testid={`input-text-${item.id}`}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Floating submit button for mobile */}
        <div className="fixed bottom-4 left-4 right-4 sm:hidden">
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="w-full"
            size="lg"
            data-testid="button-submit-mobile"
          >
            <Send className="h-4 w-4 mr-2" />
            提交答案 ({Object.keys(answers).length}/{items.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
