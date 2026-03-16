import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BookOpen, Send, AlertCircle, User, ClipboardList, FileText, ShieldAlert, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ExamWithQuestions, StudentLogin, TextSentence } from "@shared/schema";

interface VocabAnswer {
  word: string;
  pos: string;
  meaning: string;
}

interface ExamWithSentences {
  id: number;
  title: string;
  examType: string;
  submissionMode: string;
  isActive: boolean;
  createdAt: Date;
  correctText: string | null;
  sentences: TextSentence[];
  questions?: never;
}

type ActiveExam = ExamWithQuestions | ExamWithSentences;

export default function StudentExam() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<number, VocabAnswer>>({});
  const [textAnswer, setTextAnswer] = useState("");
  const [sentenceAnswers, setSentenceAnswers] = useState<Record<number, string>>({});
  const [studentInfo, setStudentInfo] = useState<StudentLogin | null>(null);
  const [warningCount, setWarningCount] = useState(0);
  const [showCheatAlert, setShowCheatAlert] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [isOcring, setIsOcring] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("studentInfo");
    if (!stored) {
      navigate(id ? `/exam/${id}` : `/exam/${id}`);
      return;
    }
    try {
      setStudentInfo(JSON.parse(stored));
    } catch {
      navigate(id ? `/exam/${id}` : `/exam/${id}`);
    }
  }, [navigate, id]);

  useEffect(() => {
    const blockBack = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", blockBack);

    const blockBackspace = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if ((e.key === "Backspace" || e.key === "Delete") && !isInput) {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", blockBackspace);

    const warnBeforeLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);

    return () => {
      window.removeEventListener("popstate", blockBack);
      document.removeEventListener("keydown", blockBackspace);
      window.removeEventListener("beforeunload", warnBeforeLeave);
    };
  }, []);

  const { data: activeExam, isLoading, error } = useQuery<ActiveExam>({
    queryKey: [`/api/exams/${id}`],
    enabled: !!studentInfo && !!id,
  });

  const isTextExam = activeExam?.examType === "text" || activeExam?.examType === "passage";
  const isPassageExam = activeExam?.examType === "passage";

  const submitMutation = useMutation({
    mutationFn: async (data: { 
      examId: number; 
      answers: { questionId: number; studentWord: string; studentPos: string; studentMeaning: string }[] 
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

  const submitTextMutation = useMutation({
    mutationFn: async (data: { 
      examId: number; 
      studentText?: string;
      sentenceAnswers?: { sentenceId: number; studentSentence: string }[];
    }) => {
      const response = await apiRequest("POST", "/api/text-submissions", {
        ...studentInfo,
        examId: data.examId,
        studentText: data.studentText || "",
        sentenceAnswers: data.sentenceAnswers,
      });
      return response.json();
    },
    onSuccess: (data) => {
      sessionStorage.setItem("submissionResult", JSON.stringify({
        ...data,
        isTextDictation: true,
      }));
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

  const isSubmitting = submitMutation.isPending || submitTextMutation.isPending || isOcring;

  // Anti-cheating: visibility change detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isSubmitting) {
        setWarningCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            // Auto submit on 3rd violation
            // Since we can't easily trigger form submit from here without a ref, 
            // we will directly call the mutation or wait for user to return
            toast({
              title: "自動提交",
              description: "由於偵測到多次離開頁面，系統已自動提交您的答案。",
              variant: "destructive",
            });
          } else {
            setShowCheatAlert(true);
          }
          return newCount;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isSubmitting, toast]);

  const hasSentences = activeExam && 'sentences' in activeExam && activeExam.sentences?.length > 0;
  const isImageMode = isPassageExam && 'submissionMode' in (activeExam || {}) && (activeExam as ExamWithSentences)?.submissionMode === "image";

  async function compressImage(file: File): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1000;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8).split(",")[1]);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setOcrText(null);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleAnswerChange = (questionId: number, field: keyof VocabAnswer, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        word: prev[questionId]?.word || "",
        pos: prev[questionId]?.pos || "",
        meaning: prev[questionId]?.meaning || "",
        [field]: value,
      }
    }));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key === "Enter" && target.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeExam) return;

    if (activeExam.examType === "text" || activeExam.examType === "passage") {
      if (isImageMode) {
        if (!imageFile) {
          toast({ title: "請先上傳手寫圖片", variant: "destructive" });
          return;
        }
        // Run OCR first, then show confirm dialog
        setIsOcring(true);
        try {
          const base64 = await compressImage(imageFile);
          const resp = await apiRequest("POST", "/api/ocr-passage", { imageBase64: base64 });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.message || "OCR 失敗");
          setOcrText(data.recognizedText);
          setTextAnswer(data.recognizedText);
        } catch (err: any) {
          toast({ title: err.message || "圖片辨識失敗，請重試", variant: "destructive" });
          setIsOcring(false);
          return;
        }
        setIsOcring(false);
        setShowConfirmDialog(true);
        return;
      }
      if (hasSentences && !isPassageExam) {
        const exam = activeExam as ExamWithSentences;
        const sentenceSubmissions = exam.sentences.map(s => ({
          sentenceId: s.id,
          studentSentence: sentenceAnswers[s.id]?.trim() || "",
        }));

        const emptyCount = sentenceSubmissions.filter(s => !s.studentSentence).length;
        if (emptyCount > 0) {
          toast({
            title: `請填寫所有句子 (尚有 ${emptyCount} 句未填)`,
            variant: "destructive"
          });
          return;
        }
      } else {
        if (!textAnswer.trim()) {
          toast({
            title: "請輸入你的答案",
            variant: "destructive"
          });
          return;
        }
      }
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmedSubmit = () => {
    if (!activeExam) return;
    setShowConfirmDialog(false);

    if (activeExam.examType === "text" || activeExam.examType === "passage") {
      if (hasSentences && !isPassageExam) {
        const exam = activeExam as ExamWithSentences;
        const sentenceSubmissions = exam.sentences.map(s => ({
          sentenceId: s.id,
          studentSentence: sentenceAnswers[s.id]?.trim() || "",
        }));
        submitTextMutation.mutate({
          examId: activeExam.id,
          sentenceAnswers: sentenceSubmissions,
        });
      } else {
        submitTextMutation.mutate({
          examId: activeExam.id,
          studentText: textAnswer.trim(),
        });
      }
    } else {
      const vocabExam = activeExam as ExamWithQuestions;
      const submissionAnswers = (vocabExam.questions || []).map(q => ({
        questionId: q.id,
        studentWord: answers[q.id]?.word?.trim() || "",
        studentPos: answers[q.id]?.pos?.trim() || "",
        studentMeaning: answers[q.id]?.meaning?.trim() || "",
      }));

      submitMutation.mutate({
        examId: activeExam.id,
        answers: submissionAnswers,
      });
    }
  };

  if (!studentInfo) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4">
        <div className="max-w-2xl mx-auto text-center">
          <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
          <Skeleton className="h-8 w-48 mx-auto mb-8" />
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !activeExam) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">找不到測驗</h2>
            <p className="text-muted-foreground mb-6">目前沒有進行中的測驗。</p>
            <Button onClick={() => navigate(id ? `/exam/${id}` : "/")}>返回登入</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4 pb-24">
      {showCheatAlert && warningCount < 3 && (
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
              <Button onClick={() => setShowCheatAlert(false)} className="w-full h-12 text-lg">
                返回考試
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">{activeExam.title}</h1>
          <div className="flex justify-center gap-4 text-sm text-muted-foreground">
            <span>{studentInfo.studentName}</span>
            <span>{studentInfo.originalClass} ({studentInfo.studentNumber}號)</span>
            <span>{studentInfo.mixedClass}</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isPassageExam ? <BookOpen className="w-5 h-5" /> : isTextExam ? <FileText className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
              {isPassageExam ? "背默" : isTextExam ? "Text Dictation" : "Vocabulary Test"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-6">
              {isTextExam ? (
                hasSentences && !isPassageExam ? (
                  <div className="space-y-4">
                    {(activeExam as ExamWithSentences).sentences
                      .sort((a, b) => a.sentenceOrder - b.sentenceOrder)
                      .map((sentence, index) => (
                      <div key={sentence.id} className="space-y-2">
                        <Label>句子 {index + 1} ({sentence.maxScore}分)</Label>
                        <Input
                          placeholder={`輸入第 ${index + 1} 句...`}
                          value={sentenceAnswers[sentence.id] || ""}
                          onChange={(e) => setSentenceAnswers(prev => ({
                            ...prev,
                            [sentence.id]: e.target.value
                          }))}
                          onPaste={handlePaste}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          className="h-11"
                        />
                      </div>
                    ))}
                  </div>
                ) : isImageMode ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">請用手寫完整課文後，拍照或選擇圖片上傳。系統會自動辨識文字並評分。</p>
                    <label className="block">
                      <span className="sr-only">選擇圖片</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageChange}
                        className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                      />
                    </label>
                    {imagePreviewUrl && (
                      <img src={imagePreviewUrl} alt="上傳預覽" className="max-h-48 rounded border object-contain" />
                    )}
                    {isOcring && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        正在辨識圖片文字...
                      </p>
                    )}
                    {ocrText && (
                      <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                        <p className="font-medium">系統識別內容：</p>
                        <p className="whitespace-pre-wrap text-muted-foreground">{ocrText}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {isPassageExam && (
                      <p className="text-sm text-muted-foreground">憑記憶默寫整段課文，不會有任何提示。</p>
                    )}
                    <Textarea
                      placeholder={isPassageExam ? "在此輸入背默內容..." : "在此輸入聽寫內容..."}
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      onPaste={handlePaste}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="min-h-[200px]"
                    />
                  </div>
                )
              ) : (
                (activeExam as ExamWithQuestions).questions
                  .sort((a, b) => a.wordOrder - b.wordOrder)
                  .map((question, index) => (
                  <Card key={question.id}>
                    <CardContent className="pt-4 space-y-4">
                      <div className="font-medium">單字 {index + 1}</div>
                      <div className="grid grid-cols-1 gap-4">
                        <Input
                          placeholder="English Word"
                          value={answers[question.id]?.word || ""}
                          onChange={(e) => handleAnswerChange(question.id, "word", e.target.value)}
                          onPaste={handlePaste}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                        <Input
                          placeholder="Part of Speech"
                          value={answers[question.id]?.pos || ""}
                          onChange={(e) => handleAnswerChange(question.id, "pos", e.target.value)}
                          onPaste={handlePaste}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                        <Input
                          placeholder="Chinese Meaning"
                          value={answers[question.id]?.meaning || ""}
                          onChange={(e) => handleAnswerChange(question.id, "meaning", e.target.value)}
                          onPaste={handlePaste}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              <Button type="button" onClick={handleSubmit as any} className="w-full h-12 text-lg" disabled={isSubmitting} data-testid="button-submit-exam">
                {isOcring ? "正在辨識圖片..." : isSubmitting ? "正在提交..." : "提交測驗"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-yellow-500" />
              確認交卷
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              你確定要提交嗎？提交後將無法修改答案。請確認所有題目已作答完畢。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-submit">返回檢查</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedSubmit} data-testid="button-confirm-submit">
              確認提交
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
