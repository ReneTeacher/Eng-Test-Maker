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
import { ArrowLeft, Save, FileText, ListOrdered, Eye, Loader2, BookOpen, List, BrainCircuit } from "lucide-react";
import type { ExamWithQuestions } from "@shared/schema";

type ExamType = "vocab" | "text" | "passage";

export default function AdminCreateExam() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [examType, setExamType] = useState<ExamType>("vocab");
  const [submissionMode, setSubmissionMode] = useState<"text" | "image">("text");
  const [title, setTitle] = useState("");
  const [vocabularies, setVocabularies] = useState("");
  const [correctText, setCorrectText] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [hasDefinitionDictation, setHasDefinitionDictation] = useState(false);
  const [definitionRatio, setDefinitionRatio] = useState(20);
  const [definitions, setDefinitions] = useState("");
  const [enableEmailReport, setEnableEmailReport] = useState(true);

  const { data: existingExam, isLoading: isExamLoading } = useQuery<ExamWithQuestions>({
    queryKey: [`/api/exams/${id}`],
    enabled: isEdit,
  });

  useEffect(() => {
    if (existingExam) {
      setTitle(existingExam.title);
      setIsActive(existingExam.isActive);
      setExamType((existingExam.examType as ExamType) || "vocab");

      if ((existingExam.examType === "text" || existingExam.examType === "passage") && existingExam.correctText) {
        setCorrectText(existingExam.correctText);
        if (existingExam.submissionMode) {
          setSubmissionMode(existingExam.submissionMode as "text" | "image");
        }
      } else {
        const sorted = existingExam.questions.sort((a, b) => a.wordOrder - b.wordOrder);
        const vocabQuestions = sorted.filter(q => q.wordScore > 0);
        const defQuestionsLoaded = sorted.filter(q => q.wordScore === 0 && (q as any).definitionScore > 0);
        const vocabString = vocabQuestions
          .map(q => `${q.correctWord} | ${q.correctPos} | ${q.correctMeaning}`)
          .join("\n");
        setVocabularies(vocabString);
        if ((existingExam as any).hasDefinitionDictation && defQuestionsLoaded.length > 0) {
          setHasDefinitionDictation(true);
          setDefinitionRatio((existingExam as any).definitionRatio ?? 20);
          const defString = defQuestionsLoaded
            .map(q => `${q.correctWord} | ${(q as any).correctDefinition || ""}`)
            .join("\n");
          setDefinitions(defString);
        }
        if ((existingExam as any).enableEmailReport !== undefined) {
          setEnableEmailReport((existingExam as any).enableEmailReport);
        }
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
      definitions?: string;
      hasDefinitionDictation?: boolean;
      definitionRatio?: number;
      correctText?: string;
      isActive: boolean;
      submissionMode?: "text" | "image";
      enableEmailReport?: boolean;
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
      if (hasDefinitionDictation) {
        const defLines = definitions.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        if (defLines.length === 0) {
          toast({ title: "請輸入 Definitions 或關閉背默詞解", variant: "destructive" });
          return;
        }
        for (let i = 0; i < defLines.length; i++) {
          const parts = defLines[i].split(/[|｜]/);
          if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
            toast({ title: `Definition 第 ${i + 1} 行格式錯誤，需為: Word | Definition`, variant: "destructive" });
            return;
          }
        }
        if (definitionRatio < 1 || definitionRatio > 99) {
          toast({ title: "定義佔比需介於 1–99", variant: "destructive" });
          return;
        }
      }
      saveMutation.mutate({
        title: title.trim(),
        examType,
        vocabularies: vocabularies.trim(),
        hasDefinitionDictation,
        definitionRatio,
        definitions: hasDefinitionDictation ? definitions.trim() : undefined,
        isActive,
        enableEmailReport,
      });
    } else {
      if (!correctText.trim()) {
        toast({ title: "Please enter the correct text", variant: "destructive" });
        return;
      }
      saveMutation.mutate({
        title: title.trim(),
        examType,
        correctText: correctText.trim(),
        isActive,
        submissionMode: examType === "passage" ? submissionMode : "text",
        enableEmailReport,
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
      const parts = line.split(/[|｜]/).map(p => p.trim());
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
                <div className="grid grid-cols-3 gap-4">
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

                  <button
                    type="button"
                    onClick={() => setExamType("passage")}
                    data-testid="button-type-passage"
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      examType === "passage"
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-md ${examType === "passage" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <BrainCircuit className="w-5 h-5" />
                      </div>
                      <span className="font-semibold">背默</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      課文背默：學生憑記憶默寫整段課文，AI 評分
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
                {examType === "vocab" ? "Vocabulary Quiz Details" : examType === "text" ? "Text Dictation Details" : "背默詳情"}
              </CardTitle>
              <CardDescription>
                {examType === "vocab"
                  ? "Enter the exam title and vocabulary list in format: Word | POS | Meaning"
                  : examType === "text"
                  ? "Enter the exam title and the correct text for AI-powered grading"
                  : "輸入試題名稱及學生需要背默的課文"}
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
                    {examType === "vocab" ? "Vocab Quiz" : examType === "text" ? "Text Dictation" : "背默"}
                  </Badge>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="title">Exam Title</Label>
                <Input
                  id="title"
                  data-testid="input-exam-title"
                  placeholder={examType === "vocab" ? "e.g., Week 1 Vocabulary Test" : examType === "text" ? "e.g., Week 1 Dictation" : "e.g., Unit 3 背默"}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11"
                />
              </div>

              {examType === "vocab" ? (
                <>
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

                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <Label htmlFor="defDictation" className="font-medium">包含背默詞解 Definitions</Label>
                      <p className="text-sm text-muted-foreground">
                        開啟後學生須默寫每個字的英文定義，用背默方式逐字比對評分
                      </p>
                    </div>
                    <Switch
                      id="defDictation"
                      checked={hasDefinitionDictation}
                      onCheckedChange={setHasDefinitionDictation}
                      data-testid="switch-definition-dictation"
                    />
                  </div>

                  {hasDefinitionDictation && (
                    <>
                      <div className="space-y-2 p-4 border rounded-lg">
                        <Label htmlFor="defRatio" className="font-medium">定義佔比（%）</Label>
                        <div className="flex items-center gap-3">
                          <Input
                            id="defRatio"
                            type="number"
                            min={1}
                            max={99}
                            value={definitionRatio}
                            onChange={(e) => setDefinitionRatio(parseInt(e.target.value) || 0)}
                            className="w-24"
                            data-testid="input-definition-ratio"
                          />
                          <p className="text-sm text-muted-foreground">
                            Vocab 部分 <strong>{100 - definitionRatio}</strong> 分 / 定義部分 <strong>{definitionRatio}</strong> 分（總分 100）
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="definitions" className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          Definition Words（格式: Word | Definition，每行一個，可與 Vocab 列表無關）
                        </Label>
                        <Textarea
                          id="definitions"
                          data-testid="textarea-definitions"
                          placeholder={"每行一個，格式: Word | Definition\n\n例子:\napple | A round fruit that grows on trees.\nrun | To move fast on foot.\nquick | Moving with great speed."}
                          value={definitions}
                          onChange={(e) => setDefinitions(e.target.value)}
                          className="min-h-[200px] font-mono text-sm"
                        />
                        <p className="text-sm text-muted-foreground">
                          學生只看到單字，須默寫完整英文定義。評分與背默相同：逐字比對。
                        </p>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="correctText" className="flex items-center gap-2">
                    {examType === "passage" ? <BrainCircuit className="w-4 h-4 text-muted-foreground" /> : <BookOpen className="w-4 h-4 text-muted-foreground" />}
                    {examType === "passage" ? "課文內容" : "Correct Text"}
                  </Label>
                  <Textarea
                    id="correctText"
                    data-testid="textarea-correct-text"
                    placeholder={examType === "passage"
                      ? "輸入學生需要背默的完整課文..."
                      : "Enter the correct text that students should transcribe...\n\nExample:\nThe quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet."}
                    value={correctText}
                    onChange={(e) => setCorrectText(e.target.value)}
                    className="min-h-[200px] text-sm"
                  />
                  <p className="text-sm text-muted-foreground">
                    {examType === "passage"
                      ? "學生須憑記憶默寫全文，系統會逐句比對並以 AI 評分"
                      : "AI will grade based on: Spelling (50pts), Punctuation (25pts), Capitalization (15pts), Word omission/addition (10pts)"}
                  </p>
                </div>
              )}

              {examType === "passage" && (
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="font-medium">學生提交方式</Label>
                    <p className="text-sm text-muted-foreground">
                      文字輸入：學生在網頁打字；拍照上傳：學生拍下手寫稿，AI 辨識後評分
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant={submissionMode === "text" ? "default" : "outline"}
                      onClick={() => setSubmissionMode("text")}
                    >
                      文字輸入
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={submissionMode === "image" ? "default" : "outline"}
                      onClick={() => setSubmissionMode("image")}
                    >
                      拍照上傳
                    </Button>
                  </div>
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

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <Label htmlFor="emailReport" className="font-medium">發送成績 Email 報告</Label>
                  <p className="text-sm text-muted-foreground">
                    學生提交後會收到成績報告（如有輸入 email）
                  </p>
                </div>
                <Switch
                  id="emailReport"
                  checked={enableEmailReport}
                  onCheckedChange={setEnableEmailReport}
                  data-testid="switch-email-report"
                />
              </div>
            </CardContent>
          </Card>

          {examType === "vocab" && vocabList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Vocab Preview ({vocabList.length} {vocabList.length === 1 ? "vocabulary" : "vocabularies"})
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

          {examType === "vocab" && hasDefinitionDictation && definitions.trim() && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Definition Words Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {definitions
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0)
                    .map((line, i) => {
                      const parts = line.split(/[|｜]/).map((p) => p.trim());
                      const isValid = parts.length === 2 && parts[0] && parts[1];
                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-3 p-2 rounded-md ${
                            isValid ? "bg-muted/50" : "bg-destructive/10 border border-destructive/30"
                          }`}
                        >
                          <span className="font-semibold text-sm w-6">{i + 1}.</span>
                          {isValid ? (
                            <>
                              <Badge variant="secondary" className="font-mono">
                                {parts[0]}
                              </Badge>
                              <span className="text-sm text-muted-foreground flex-1">{parts[1]}</span>
                            </>
                          ) : (
                            <span className="text-sm text-destructive">Invalid format: {line}</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}
          
          {(examType === "text" || examType === "passage") && correctText.trim() && (() => {
            if (examType === "passage") {
              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Eye className="w-5 h-5" />
                      課文預覽
                    </CardTitle>
                    <CardDescription>
                      儲存時 AI 會自動分句（支援電郵格式），分句結果可在編輯頁查看
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">{correctText.trim()}</p>
                  </CardContent>
                </Card>
              );
            }
            const sentences = correctText.trim()
              .split(/(?<=[.!?。！？])\s*/)
              .map(s => s.trim())
              .filter(s => s.length > 0);
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    {`句子預覽 (${sentences.length} 句)`}
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
