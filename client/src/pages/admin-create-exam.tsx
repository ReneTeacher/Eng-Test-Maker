import { useState, useEffect } from "react";
import { useLocation, Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Save, FileText, ListOrdered, Eye, Loader2, BookOpen, List } from "lucide-react";
import type { ExamWithQuestions } from "@shared/schema";

type ExamType = "vocab" | "text";

export default function AdminCreateExam() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [examType, setExamType] = useState<ExamType>("vocab");
  const [title, setTitle] = useState("");
  const [vocabularies, setVocabularies] = useState("");
  const [correctText, setCorrectText] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: existingExam, isLoading: isExamLoading } = useQuery<ExamWithQuestions>({
    queryKey: [`/api/exams/${id}`],
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingExam) {
      setTitle(existingExam.title);
      setIsActive(existingExam.isActive);
      setExamType((existingExam.examType as ExamType) || "vocab");
      
      if (existingExam.examType === "text" && existingExam.correctText) {
        setCorrectText(existingExam.correctText);
      } else {
        const vocabString = existingExam.questions
          .sort((a, b) => a.wordOrder - b.wordOrder)
          .map(q => `${q.correctWord} | ${q.correctPos} | ${q.correctMeaning}`)
          .join("\n");
        setVocabularies(vocabString);
      }
    }
  }, [existingExam]);

  useEffect(() => {
    const isAuth = sessionStorage.getItem("adminAuth");
    if (!isAuth) {
      navigate("/admin");
    }
  }, [navigate]);

  const saveMutation = useMutation({
    mutationFn: async (data: { 
      title: string; 
      examType: ExamType;
      vocabularies?: string; 
      correctText?: string;
      isActive: boolean 
    }) => {
      const url = isEdit ? `/api/exams/${id}` : "/api/exams";
      const method = isEdit ? "PATCH" : "POST";
      const response = await apiRequest(method, url, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to ${isEdit ? "update" : "create"} exam`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: [`/api/exams/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({ title: `Exam ${isEdit ? "updated" : "created"} successfully` });
      navigate("/admin/dashboard");
    },
    onError: (error: Error) => {
      toast({ 
        title: `Failed to ${isEdit ? "save" : "create"} exam`, 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({ title: "Please enter a title", variant: "destructive" });
      return;
    }
    
    if (examType === "vocab") {
      if (!vocabularies.trim()) {
        toast({ title: "Please enter at least one vocabulary entry", variant: "destructive" });
        return;
      }
      saveMutation.mutate({ 
        title: title.trim(), 
        examType,
        vocabularies: vocabularies.trim(), 
        isActive 
      });
    } else {
      if (!correctText.trim()) {
        toast({ title: "Please enter the correct text for dictation", variant: "destructive" });
        return;
      }
      saveMutation.mutate({ 
        title: title.trim(), 
        examType,
        correctText: correctText.trim(), 
        isActive 
      });
    }
  };
  
  const isFormValid = examType === "vocab" 
    ? (title.trim() && vocabularies.trim())
    : (title.trim() && correctText.trim());

  const vocabList = vocabularies
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split("|").map(p => p.trim());
      if (parts.length === 3) {
        return { word: parts[0], pos: parts[1], meaning: parts[2], valid: true };
      }
      return { word: line, pos: "", meaning: "", valid: false };
    });

  if (isEdit && isExamLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-bold text-lg">{isEdit ? "Edit Exam" : "Create New Exam"}</h1>
            <p className="text-sm text-muted-foreground">{isEdit ? "Modify existing test and update scores" : "Add a dictation test for students"}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {!isEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Exam Type</CardTitle>
                <CardDescription>
                  Choose the type of test you want to create
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setExamType("vocab")}
                    data-testid="button-type-vocab"
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      examType === "vocab"
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-md ${examType === "vocab" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <List className="w-5 h-5" />
                      </div>
                      <span className="font-semibold">Vocab Quiz</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      單字測驗：Word | POS | Meaning 格式，每部分獨立評分
                    </p>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setExamType("text")}
                    data-testid="button-type-text"
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      examType === "text"
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-md ${examType === "text" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <span className="font-semibold">Text Dictation</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      段落默書：AI 智能評分整段文字，檢查拼字、標點、大小寫
                    </p>
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {examType === "vocab" ? "Vocabulary Quiz Details" : "Text Dictation Details"}
              </CardTitle>
              <CardDescription>
                {examType === "vocab" 
                  ? "Enter the exam title and vocabulary list in format: Word | POS | Meaning"
                  : "Enter the exam title and the correct text for AI-powered grading"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {isEdit && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md mb-4 text-sm text-yellow-700 dark:text-yellow-400">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p>
                      <strong>Important:</strong> Updating an exam will automatically re-calculate the scores of all existing student submissions based on the new correct answers.
                    </p>
                  </div>
                </div>
              )}
              
              {isEdit && (
                <div className="p-3 bg-muted rounded-md mb-2">
                  <span className="text-sm text-muted-foreground">Exam Type: </span>
                  <Badge variant="secondary">
                    {examType === "vocab" ? "Vocab Quiz" : "Text Dictation"}
                  </Badge>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="title">Exam Title</Label>
                <Input
                  id="title"
                  data-testid="input-exam-title"
                  placeholder={examType === "vocab" ? "e.g., Week 1 Vocabulary Test" : "e.g., Week 1 Dictation"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11"
                />
              </div>

              {examType === "vocab" ? (
                <div className="space-y-2">
                  <Label htmlFor="vocabularies" className="flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-muted-foreground" />
                    Vocabulary List
                  </Label>
                  <Textarea
                    id="vocabularies"
                    data-testid="textarea-vocabularies"
                    placeholder="Enter one vocabulary per line in format: Word | POS | Meaning&#10;&#10;Example:&#10;Apple | noun | 蘋果&#10;Run | verb | 跑, 跑步&#10;Quick | adjective | 快的/迅速的"
                    value={vocabularies}
                    onChange={(e) => setVocabularies(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-sm text-muted-foreground">
                    滿分 100 分，將自動分配分數。格式: Word | POS | Meaning。
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="correctText" className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    Correct Text
                  </Label>
                  <Textarea
                    id="correctText"
                    data-testid="textarea-correct-text"
                    placeholder="Enter the correct text that students should transcribe...&#10;&#10;Example:&#10;The quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet."
                    value={correctText}
                    onChange={(e) => setCorrectText(e.target.value)}
                    className="min-h-[200px] text-sm"
                  />
                  <p className="text-sm text-muted-foreground">
                    AI will grade based on: Spelling (50pts), Punctuation (25pts), Capitalization (15pts), Word omission/addition (10pts)
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <Label htmlFor="active" className="font-medium">Set as Active Exam</Label>
                  <p className="text-sm text-muted-foreground">
                    Only one exam can be active at a time
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  data-testid="switch-active"
                />
              </div>
            </CardContent>
          </Card>

          {examType === "vocab" && vocabList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Preview ({vocabList.length} {vocabList.length === 1 ? "vocabulary" : "vocabularies"})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {vocabList.map((vocab, i) => (
                    <div 
                      key={i} 
                      className={`flex items-center gap-3 p-2 rounded-md ${vocab.valid ? 'bg-muted/50' : 'bg-destructive/10 border border-destructive/30'}`}
                    >
                      <span className="font-semibold text-sm w-6">{i + 1}.</span>
                      {vocab.valid ? (
                        <>
                          <Badge variant="secondary" className="font-mono">{vocab.word}</Badge>
                          <Badge variant="outline" className="font-mono">{vocab.pos}</Badge>
                          <span className="text-sm text-muted-foreground">{vocab.meaning}</span>
                        </>
                      ) : (
                        <span className="text-sm text-destructive">Invalid format: {vocab.word}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {examType === "text" && correctText.trim() && (() => {
            const sentences = correctText.trim()
              .split(/(?<=[.!?。！？])\s*/)
              .map(s => s.trim())
              .filter(s => s.length > 0);
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    句子預覽 ({sentences.length} 句)
                  </CardTitle>
                  <CardDescription>
                    按以下順序讀出每句，學生將逐句輸入
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {sentences.map((sentence, i) => (
                      <div 
                        key={i} 
                        className="flex items-start gap-3 p-3 bg-muted/50 rounded-md"
                      >
                        <Badge variant="default" className="shrink-0 mt-0.5">
                          第 {i + 1} 句
                        </Badge>
                        <span className="text-sm">{sentence}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    滿分 100 分，共 {sentences.length} 句，每句約 {Math.round(100 / sentences.length)} 分
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          <div className="flex gap-3">
            <Link href="/admin/dashboard" className="flex-1">
              <Button 
                type="button" 
                variant="outline" 
                className="w-full"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </Link>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={saveMutation.isPending || !isFormValid}
              data-testid="button-save-exam"
            >
              {saveMutation.isPending ? (
                isEdit ? "Updating..." : "Creating..."
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {isEdit ? "Update Exam" : "Create Exam"}
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

import { AlertCircle } from "lucide-react";
