import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ExternalLink, Send, CheckCircle2, XCircle, User, Loader2, RefreshCw, BookOpen, AlertCircle } from "lucide-react";
import type { AnswerSheetSession, QuestionItem, PartItem } from "@shared/schema";
import { useAntiCheating } from "@/hooks/use-anti-cheating";

interface FlatQuestion {
  partId?: string;
  partName?: string;
  question: QuestionItem;
}

export default function StudentAnswerSheet() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [originalClass, setOriginalClass] = useState("");
  const [mixedClass, setMixedClass] = useState("");
  
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showPaper, setShowPaper] = useState(false);

  const [result, setResult] = useState<{ totalScore: number; maxScore: number; percentage: number; submissionId?: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportStatus, setReportStatus] = useState<"none" | "pending" | "generating" | "completed" | "failed">("none");
  const [reportContent, setReportContent] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmitRef = useRef<() => void>(() => {});

  const { warningCount, violations, showWarningDialog, setShowWarningDialog, handlePaste } = useAntiCheating({
    enabled: isLoggedIn && !result && !isSubmitting,
    maxWarnings: 3,
    onAutoSubmit: () => {
      toast({
        title: "自動提交",
        description: "由於偵測到多次離開頁面，系統已自動提交您的答案。",
        variant: "destructive",
      });
      autoSubmitRef.current();
    },
  });

  const { data: session, isLoading, error } = useQuery<AnswerSheetSession>({
    queryKey: ["/api/answer-sheets", id],
    queryFn: async () => {
      const res = await fetch(`/api/answer-sheets/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  // Parse items - support both old format (flat array) and new format (parts)
  const parseItems = (): { parts: PartItem[] | null; flatQuestions: FlatQuestion[] } => {
    if (!session) return { parts: null, flatQuestions: [] };
    
    try {
      const parsed = JSON.parse(session.itemsJson);
      
      if (Array.isArray(parsed) && parsed.length > 0 && 'partId' in parsed[0]) {
        // New parts format
        const parts = parsed as PartItem[];
        const flatQuestions: FlatQuestion[] = [];
        for (const part of parts) {
          for (const q of part.questions) {
            flatQuestions.push({ partId: part.partId, partName: part.partName, question: q });
          }
        }
        return { parts, flatQuestions };
      } else {
        // Old flat format
        const items = parsed as QuestionItem[];
        const flatQuestions = items.map(q => ({ question: q }));
        return { parts: null, flatQuestions };
      }
    } catch {
      return { parts: null, flatQuestions: [] };
    }
  };

  const { parts, flatQuestions } = parseItems();

  const submitMutation = useMutation({
    mutationFn: async (cheatingData: { warningCount: number; violations: { type: string; timestamp: string }[] }) => {
      setIsSubmitting(true);
      const response = await apiRequest("POST", `/api/answer-sheets/${id}/submit`, {
        studentName,
        studentNumber: parseInt(studentNumber),
        originalClass,
        mixedClass,
        answers,
        warningCount: cheatingData.warningCount,
        violations: cheatingData.violations,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "提交成功" });
    },
    onError: () => {
      setIsSubmitting(false);
      toast({ title: "提交失敗", variant: "destructive" });
    },
  });

  const getEmbedUrl = (link: string): string => {
    const driveMatch = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    return link;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !studentNumber || !originalClass || !mixedClass) {
      toast({ title: "請填寫所有欄位", variant: "destructive" });
      return;
    }
    setIsLoggedIn(true);
  };

  const getAnswerKey = (partId: string | undefined, questionId: number) => {
    return partId ? `${partId}:${questionId}` : String(questionId);
  };

  const selectMcAnswer = (partId: string | undefined, questionId: number, option: string) => {
    const key = getAnswerKey(partId, questionId);
    setAnswers((prev) => ({ ...prev, [key]: option }));
  };

  const setTextAnswer = (partId: string | undefined, questionId: number, value: string) => {
    const key = getAnswerKey(partId, questionId);
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const startReportPolling = (submissionId: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`/api/answer-sheets/submissions/${submissionId}/report`);
        if (resp.ok) {
          const data = await resp.json();
          setReportStatus(data.status);
          if (data.status === "completed" && data.content) {
            setReportContent(data.content);
            if (pollRef.current) clearInterval(pollRef.current);
          } else if (data.status === "failed") {
            setReportContent(data.content || "生成失敗");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {}
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleRegenerateReport = async () => {
    if (!result?.submissionId) return;
    setReportStatus("pending");
    setReportContent("");
    try {
      await apiRequest("POST", `/api/answer-sheets/submissions/${result.submissionId}/regenerate-report`);
      startReportPolling(result.submissionId);
    } catch {
      toast({ title: "重新生成失敗", variant: "destructive" });
    }
  };

  const handleSubmit = () => {
    const unanswered = flatQuestions.filter((item) => {
      const key = getAnswerKey(item.partId, item.question.id);
      return !answers[key];
    });
    if (unanswered.length > 0) {
      if (!confirm(`還有 ${unanswered.length} 題未作答，確定要提交嗎？`)) {
        return;
      }
    }
    submitMutation.mutate({ warningCount, violations });
  };

  autoSubmitRef.current = () => submitMutation.mutate({ warningCount, violations });

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
              <p className="text-sm text-muted-foreground">班號: {studentNumber}</p>
              <p className="text-sm text-muted-foreground">原班: {originalClass}</p>
              <p className="text-sm text-muted-foreground">走班: {mixedClass}</p>
            </div>
            
            <div className="mt-6 text-left max-h-64 overflow-y-auto border rounded-md p-3">
              {parts ? (
                // Multi-part format
                parts.map((part) => (
                  <div key={part.partId} className="mb-4">
                    <h4 className="font-semibold text-primary text-sm mb-2">{part.partName}</h4>
                    {part.questions.map((q) => {
                      const key = getAnswerKey(part.partId, q.id);
                      const studentAnswer = answers[key] || "(未作答)";
                      const isCorrect = studentAnswer.toLowerCase().trim() === q.correct.toLowerCase().trim();
                      return (
                        <div key={key} className="flex items-center gap-2 py-1 border-b last:border-0">
                          <span className="w-8 text-muted-foreground">Q{q.id}</span>
                          {isCorrect ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className={isCorrect ? "text-green-600" : "text-red-600"}>
                            {studentAnswer}
                          </span>
                          {!isCorrect && (
                            <span className="text-xs text-muted-foreground ml-auto">({q.correct})</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                // Flat format
                flatQuestions.map((item) => {
                  const key = getAnswerKey(item.partId, item.question.id);
                  const studentAnswer = answers[key] || "(未作答)";
                  const isCorrect = studentAnswer.toLowerCase().trim() === item.question.correct.toLowerCase().trim();
                  return (
                    <div key={key} className="flex items-center gap-2 py-1 border-b last:border-0">
                      <span className="w-8 text-muted-foreground">Q{item.question.id}</span>
                      {isCorrect ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className={isCorrect ? "text-green-600" : "text-red-600"}>
                        {studentAnswer}
                      </span>
                      {!isCorrect && (
                        <span className="text-xs text-muted-foreground ml-auto">({item.question.correct})</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* AI Learning Report - temporarily hidden */}
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
                <Label htmlFor="class">原班</Label>
                <Select value={originalClass} onValueChange={setOriginalClass}>
                  <SelectTrigger data-testid="select-class">
                    <SelectValue placeholder="選擇原班" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="J3A">J3A</SelectItem>
                    <SelectItem value="J3B">J3B</SelectItem>
                    <SelectItem value="J3C">J3C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="mixedClass">走班</Label>
                <Select value={mixedClass} onValueChange={setMixedClass}>
                  <SelectTrigger data-testid="select-mixed-class">
                    <SelectValue placeholder="選擇走班" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="英文1班">英文1班</SelectItem>
                    <SelectItem value="英文2班">英文2班</SelectItem>
                    <SelectItem value="英文3班">英文3班</SelectItem>
                    <SelectItem value="英文4班">英文4班</SelectItem>
                    <SelectItem value="英文5班">英文5班</SelectItem>
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

  const embedUrl = session ? getEmbedUrl(session.paperLink) : "";

  const questionsContent = (
    <>
      {parts ? (
        parts.map((part) => (
          <div key={part.partId}>
            <h3 className="text-lg font-semibold text-primary mb-3 sticky top-14 bg-background py-2 z-[5]">
              {part.partName}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {part.questions.map((question) => {
                const key = getAnswerKey(part.partId, question.id);
                return (
                  <Card key={key} className="relative">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                          {question.id}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          question.type === "mc" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        }`}>
                          {question.type === "mc" ? "MC" : "填充"}
                        </span>
                      </div>
                      {question.type === "mc" && question.options ? (
                        <div className="flex flex-wrap gap-2">
                          {question.options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => selectMcAnswer(part.partId, question.id, option)}
                              className={`w-12 h-12 rounded-full border-2 font-bold text-lg transition-all ${
                                answers[key] === option
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background text-foreground border-border hover:border-primary/50"
                              }`}
                              data-testid={`button-option-${part.partId}-${question.id}-${option}`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Input
                          placeholder="輸入答案"
                          value={answers[key] || ""}
                          onChange={(e) => setTextAnswer(part.partId, question.id, e.target.value)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck="false"
                          onPaste={handlePaste}
                          data-testid={`input-text-${part.partId}-${question.id}`}
                        />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {flatQuestions.map((item) => {
            const key = getAnswerKey(item.partId, item.question.id);
            return (
              <Card key={key} className="relative">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                      {item.question.id}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      item.question.type === "mc" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    }`}>
                      {item.question.type === "mc" ? "MC" : "填充"}
                    </span>
                  </div>
                  {item.question.type === "mc" && item.question.options ? (
                    <div className="flex flex-wrap gap-2">
                      {item.question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => selectMcAnswer(item.partId, item.question.id, option)}
                          className={`w-12 h-12 rounded-full border-2 font-bold text-lg transition-all ${
                            answers[key] === option
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-border hover:border-primary/50"
                          }`}
                          data-testid={`button-option-${item.question.id}-${option}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      placeholder="輸入答案"
                      value={answers[key] || ""}
                      onChange={(e) => setTextAnswer(item.partId, item.question.id, e.target.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      onPaste={handlePaste}
                      data-testid={`input-text-${item.question.id}`}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );

  // Show answer form with split-screen layout
  return (
    <div className="min-h-screen bg-background">
      {showWarningDialog && warningCount < 3 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="max-w-md w-full border-destructive shadow-2xl">
            <CardHeader className="bg-destructive text-destructive-foreground">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-6 h-6" />
                <CardTitle>嚴正警告 (第 {warningCount} 次)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4 text-center">
              <p className="text-lg font-bold text-destructive">偵測到您離開了考試頁面！</p>
              <p>請保持在考試分頁。離開頁面超過 3 次將自動提交答案。</p>
              <Button onClick={() => setShowWarningDialog(false)} className="w-full h-12 text-lg">
                返回考試
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mobile: fullscreen paper overlay */}
      {showPaper && (
        <div className="md:hidden fixed inset-0 z-50 bg-background flex flex-col">
          <iframe
            src={embedUrl}
            className="flex-1 w-full"
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin"
          />
          <div className="p-3 border-t">
            <Button onClick={() => setShowPaper(false)} className="w-full" size="lg">
              返回答題
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-screen">
        {/* Desktop: left side paper panel */}
        {showPaper && (
          <div className="hidden md:block md:w-1/2 border-r sticky top-0 h-screen">
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allow="autoplay"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        )}

        {/* Right side: header + questions */}
        <div className={showPaper ? "w-full md:w-1/2" : "w-full"}>
          <div className="sticky top-0 z-10 bg-background border-b p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h1 className="text-base font-bold truncate">{session.title}</h1>
                <p className="text-xs text-muted-foreground">{studentName} ({originalClass})</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant={showPaper ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPaper(prev => !prev)}
                  data-testid="button-view-paper"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">{showPaper ? "收起試卷" : "查看試卷"}</span>
                  <span className="sm:hidden">{showPaper ? "收起" : "試卷"}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitMutation.isPending}
                  data-testid="button-submit"
                >
                  <Send className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">提交答案</span>
                  <span className="sm:hidden">提交</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-6 pb-20">
            {questionsContent}
          </div>

          <div className="fixed bottom-4 left-4 right-4 md:hidden">
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="w-full"
              size="lg"
              data-testid="button-submit-mobile"
            >
              <Send className="h-4 w-4 mr-2" />
              提交答案 ({Object.keys(answers).length}/{flatQuestions.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
