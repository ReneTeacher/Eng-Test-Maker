import { useState, useEffect, useMemo } from "react";
import { useLocation, Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Search, 
  Eye, 
  Edit2, 
  BarChart3, 
  Users,
  Check,
  X,
  TrendingUp,
  TrendingDown,
  Award
} from "lucide-react";
import type { Exam, StudentSubmission, Question, AnswerDetail, TextSubmission, TextSentence, TextAnswerDetail } from "@shared/schema";

interface VocabSubmissionDetail extends StudentSubmission {
  answers: AnswerDetail[];
  questions: Question[];
}

interface TextSubmissionDetail extends TextSubmission {
  answers: TextAnswerDetail[];
  sentences: TextSentence[];
}

interface Analytics {
  examType: string;
  totalSubmissions: number;
  averageScore: number;
  maxScore: number;
  highestScore: number;
  lowestScore: number;
  passRate: number;
  scoreDistribution: number[];
  questionAnalysis?: {
    questionId: number;
    order: number;
    word: string;
    pos: string;
    meaning: string;
    wordCorrectRate: number;
    posCorrectRate: number;
    meaningCorrectRate: number;
    overallCorrectRate: number;
  }[];
  sentenceAnalysis?: {
    sentenceId: number;
    order: number;
    maxScore: number;
    averageScore: number;
    correctRate: number;
  }[];
}

export default function AdminSubmissions() {
  const { examId } = useParams<{ examId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [selectedSubmission, setSelectedSubmission] = useState<VocabSubmissionDetail | TextSubmissionDetail | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editScores, setEditScores] = useState<Record<number, number>>({});
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    const isAuth = sessionStorage.getItem("adminAuth");
    if (!isAuth) {
      navigate("/admin");
    }
  }, [navigate]);

  const { data: exam } = useQuery<Exam>({
    queryKey: [`/api/exams/${examId}`],
    enabled: !!examId,
  });

  const isTextType = exam?.examType === "text" || exam?.examType === "passage";

  const { data: vocabSubmissions } = useQuery<StudentSubmission[]>({
    queryKey: ["/api/submissions"],
    enabled: exam?.examType === "vocab",
  });

  const { data: textSubmissions } = useQuery<TextSubmission[]>({
    queryKey: ["/api/text-submissions"],
    enabled: isTextType,
  });

  const { data: analytics } = useQuery<Analytics>({
    queryKey: [`/api/exams/${examId}/analytics`],
    enabled: !!examId && showAnalytics,
  });

  const submissions = useMemo(() => {
    const all = isTextType
      ? textSubmissions?.filter(s => s.examId === Number(examId)) || []
      : vocabSubmissions?.filter(s => s.examId === Number(examId)) || [];
    
    return all.filter(sub => {
      const matchesSearch = !searchQuery || 
        sub.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.studentNumber.toString().includes(searchQuery);
      
      const matchesClass = classFilter === "all" || sub.originalClass === classFilter;
      
      let matchesScore = true;
      if (scoreFilter === "pass") matchesScore = sub.totalScore >= 60;
      else if (scoreFilter === "fail") matchesScore = sub.totalScore < 60;
      else if (scoreFilter === "excellent") matchesScore = sub.totalScore >= 90;
      
      return matchesSearch && matchesClass && matchesScore;
    });
  }, [exam, vocabSubmissions, textSubmissions, examId, searchQuery, classFilter, scoreFilter]);

  const updateScoreMutation = useMutation({
    mutationFn: async ({ id, totalScore, answers }: { id: number; totalScore: number; answers?: { id: number; earnedScore: number }[] }) => {
      const endpoint = isTextType ? `/api/text-submissions/${id}` : `/api/submissions/${id}`;
      const response = await apiRequest("PATCH", endpoint, { totalScore, answers });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/text-submissions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/exams/${examId}/analytics`] });
      toast({ title: "分數已更新" });
      setIsEditMode(false);
      setIsDetailOpen(false);
    },
    onError: () => {
      toast({ title: "更新失敗", variant: "destructive" });
    },
  });

  const deleteSubmissionMutation = useMutation({
    mutationFn: async (id: number) => {
      const endpoint = isTextType ? `/api/text-submissions/${id}` : `/api/submissions/${id}`;
      const response = await apiRequest("DELETE", endpoint);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/text-submissions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/exams/${examId}/analytics`] });
      toast({ title: "提交記錄已刪除" });
      setIsDetailOpen(false);
    },
    onError: () => {
      toast({ title: "刪除失敗", variant: "destructive" });
    },
  });

  const handleDeleteSubmission = (id: number) => {
    if (confirm("確定要刪除這筆提交記錄嗎？此操作無法還原。")) {
      deleteSubmissionMutation.mutate(id);
    }
  };

  const fetchSubmissionDetails = async (submissionId: number) => {
    const endpoint = isTextType
      ? `/api/text-submissions/${submissionId}`
      : `/api/submissions/${submissionId}`;
    const response = await fetch(endpoint);
    const data = await response.json();
    setSelectedSubmission(data);
    setIsDetailOpen(true);
    
    if (isTextType) {
      const detail = data as TextSubmissionDetail;
      const scores: Record<number, number> = {};
      detail.answers.forEach(a => { scores[a.id] = a.earnedScore; });
      setEditScores(scores);
    } else {
      const detail = data as VocabSubmissionDetail;
      const scores: Record<number, number> = {};
      detail.answers.forEach(a => { scores[a.id] = a.earnedScore; });
      setEditScores(scores);
    }
  };

  const handleSaveScores = () => {
    if (!selectedSubmission) return;
    
    const answers = Object.entries(editScores).map(([id, earnedScore]) => ({
      id: Number(id),
      earnedScore,
    }));
    
    const totalScore = Object.values(editScores).reduce((a, b) => a + b, 0);
    
    updateScoreMutation.mutate({
      id: selectedSubmission.id,
      totalScore,
      answers,
    });
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString("zh-TW", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 90) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-lg">{exam?.title || "提交記錄"}</h1>
              <p className="text-sm text-muted-foreground">查看及管理學生答卷</p>
            </div>
          </div>
          <Button 
            variant={showAnalytics ? "default" : "outline"} 
            onClick={() => setShowAnalytics(!showAnalytics)}
            data-testid="button-toggle-analytics"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {showAnalytics ? "隱藏分析" : "查看分析"}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {showAnalytics && analytics && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{analytics.totalSubmissions}</p>
                      <p className="text-sm text-muted-foreground">總提交數</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{analytics.averageScore}</p>
                      <p className="text-sm text-muted-foreground">平均分</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                      <Award className="w-6 h-6 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{analytics.highestScore}</p>
                      <p className="text-sm text-muted-foreground">最高分</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{analytics.passRate}%</p>
                      <p className="text-sm text-muted-foreground">及格率</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">分數分佈</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-32">
                  {analytics.scoreDistribution.map((count, i) => {
                    const maxCount = Math.max(...analytics.scoreDistribution, 1);
                    const height = (count / maxCount) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div 
                          className="w-full bg-primary/80 rounded-t transition-all"
                          style={{ height: `${height}%`, minHeight: count > 0 ? 4 : 0 }}
                        />
                        <span className="text-xs text-muted-foreground">{i * 10}</span>
                        {count > 0 && <span className="text-xs font-medium">{count}</span>}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {analytics.questionAnalysis && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">題目難度分析</CardTitle>
                  <CardDescription>顯示每道題的正確率</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>題號</TableHead>
                        <TableHead>詞彙</TableHead>
                        <TableHead>詞性正確率</TableHead>
                        <TableHead>拼寫正確率</TableHead>
                        <TableHead>意思正確率</TableHead>
                        <TableHead>總體正確率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.questionAnalysis
                        .sort((a, b) => a.order - b.order)
                        .map((q) => (
                        <TableRow key={q.questionId}>
                          <TableCell>{q.order}</TableCell>
                          <TableCell className="font-medium">{q.word}</TableCell>
                          <TableCell>
                            <Badge variant={q.posCorrectRate >= 80 ? "default" : q.posCorrectRate >= 50 ? "secondary" : "destructive"}>
                              {q.posCorrectRate}%
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={q.wordCorrectRate >= 80 ? "default" : q.wordCorrectRate >= 50 ? "secondary" : "destructive"}>
                              {q.wordCorrectRate}%
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={q.meaningCorrectRate >= 80 ? "default" : q.meaningCorrectRate >= 50 ? "secondary" : "destructive"}>
                              {q.meaningCorrectRate}%
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={q.overallCorrectRate >= 80 ? "default" : q.overallCorrectRate >= 50 ? "secondary" : "destructive"}>
                              {q.overallCorrectRate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {analytics.sentenceAnalysis && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">句子難度分析</CardTitle>
                  <CardDescription>顯示每句的平均得分率</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>句號</TableHead>
                        <TableHead>滿分</TableHead>
                        <TableHead>平均得分</TableHead>
                        <TableHead>得分率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.sentenceAnalysis
                        .sort((a, b) => a.order - b.order)
                        .map((s) => (
                        <TableRow key={s.sentenceId}>
                          <TableCell>第 {s.order} 句</TableCell>
                          <TableCell>{s.maxScore} 分</TableCell>
                          <TableCell>{s.averageScore.toFixed(1)} 分</TableCell>
                          <TableCell>
                            <Badge variant={s.correctRate >= 80 ? "default" : s.correctRate >= 50 ? "secondary" : "destructive"}>
                              {s.correctRate.toFixed(0)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg">學生提交記錄</CardTitle>
              <CardDescription>共 {submissions.length} 份提交</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜尋學生姓名或學號..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-class-filter">
                  <SelectValue placeholder="班級" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有班級</SelectItem>
                  <SelectItem value="J3A">J3A</SelectItem>
                  <SelectItem value="J3B">J3B</SelectItem>
                  <SelectItem value="J3C">J3C</SelectItem>
                </SelectContent>
              </Select>
              <Select value={scoreFilter} onValueChange={setScoreFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-score-filter">
                  <SelectValue placeholder="分數" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有分數</SelectItem>
                  <SelectItem value="excellent">優秀 (≥90)</SelectItem>
                  <SelectItem value="pass">及格 (≥60)</SelectItem>
                  <SelectItem value="fail">不及格 (&lt;60)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {submissions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>暫無提交記錄</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>學生</TableHead>
                    <TableHead>學號</TableHead>
                    <TableHead>原班</TableHead>
                    <TableHead>分班</TableHead>
                    <TableHead>分數</TableHead>
                    <TableHead>提交時間</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.studentName}</TableCell>
                      <TableCell>{sub.studentNumber}</TableCell>
                      <TableCell>{sub.originalClass}</TableCell>
                      <TableCell>{sub.mixedClass}</TableCell>
                      <TableCell>
                        <Badge variant={getScoreBadgeVariant(sub.totalScore)}>
                          {sub.totalScore} / 100
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(sub.submittedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => fetchSubmissionDetails(sub.id)}
                            data-testid={`button-view-${sub.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              fetchSubmissionDetails(sub.id);
                              setIsEditMode(true);
                            }}
                            data-testid={`button-edit-${sub.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteSubmission(sub.id)}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-${sub.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={isDetailOpen} onOpenChange={(open) => { setIsDetailOpen(open); if (!open) setIsEditMode(false); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "編輯分數" : "答卷詳情"} - {selectedSubmission?.studentName}
            </DialogTitle>
            <DialogDescription>
              學號: {selectedSubmission?.studentNumber} | {selectedSubmission?.originalClass} | {selectedSubmission?.mixedClass}
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-4">
              {isTextType ? (
                <div className="space-y-3">
                  {(selectedSubmission as TextSubmissionDetail).sentences
                    ?.sort((a, b) => a.sentenceOrder - b.sentenceOrder)
                    .map((sentence) => {
                      const answer = (selectedSubmission as TextSubmissionDetail).answers.find(
                        a => a.sentenceId === sentence.id
                      );
                      return (
                        <Card key={sentence.id} className="border">
                          <CardContent className="pt-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">第 {sentence.sentenceOrder} 句</span>
                              {isEditMode ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={sentence.maxScore}
                                    value={editScores[answer?.id || 0] || 0}
                                    onChange={(e) => setEditScores(prev => ({
                                      ...prev,
                                      [answer?.id || 0]: Number(e.target.value)
                                    }))}
                                    className="w-20 h-8"
                                  />
                                  <span className="text-sm text-muted-foreground">/ {sentence.maxScore}</span>
                                </div>
                              ) : (
                                <Badge variant={answer?.earnedScore === sentence.maxScore ? "default" : "secondary"}>
                                  {answer?.earnedScore || 0} / {sentence.maxScore}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm">
                              <p className="text-muted-foreground">正確答案:</p>
                              <p className="text-green-600 dark:text-green-400">{sentence.correctSentence}</p>
                            </div>
                            <div className="text-sm">
                              <p className="text-muted-foreground">學生答案:</p>
                              <p className={answer?.earnedScore === sentence.maxScore ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                {answer?.studentSentence || "(未作答)"}
                              </p>
                            </div>
                            {answer?.feedback && (
                              <div className="text-sm">
                                <p className="text-muted-foreground">AI 評語:</p>
                                <p className="text-muted-foreground italic">{answer.feedback}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              ) : (
                <div className="space-y-3">
                  {(selectedSubmission as VocabSubmissionDetail).questions
                    ?.sort((a, b) => a.wordOrder - b.wordOrder)
                    .map((question) => {
                      const answer = (selectedSubmission as VocabSubmissionDetail).answers.find(
                        a => a.questionId === question.id
                      );
                      const maxScore = question.wordScore + question.posScore + question.meaningScore;
                      return (
                        <Card key={question.id} className="border">
                          <CardContent className="pt-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">詞彙 {question.wordOrder}</span>
                              {isEditMode ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={maxScore}
                                    value={editScores[answer?.id || 0] || 0}
                                    onChange={(e) => setEditScores(prev => ({
                                      ...prev,
                                      [answer?.id || 0]: Number(e.target.value)
                                    }))}
                                    className="w-20 h-8"
                                  />
                                  <span className="text-sm text-muted-foreground">/ {maxScore}</span>
                                </div>
                              ) : (
                                <Badge variant={answer?.earnedScore === maxScore ? "default" : "secondary"}>
                                  {answer?.earnedScore || 0} / {maxScore}
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground mb-1">英文詞彙</p>
                                <p className="text-green-600 dark:text-green-400">{question.correctWord}</p>
                                <p className={answer?.wordCorrect ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                  {answer?.studentWord || "-"} {answer?.wordCorrect ? <Check className="inline w-3 h-3" /> : <X className="inline w-3 h-3" />}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">詞性</p>
                                <p className="text-green-600 dark:text-green-400">{question.correctPos}</p>
                                <p className={answer?.posCorrect ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                  {answer?.studentPos || "-"} {answer?.posCorrect ? <Check className="inline w-3 h-3" /> : <X className="inline w-3 h-3" />}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">中文意思</p>
                                <p className="text-green-600 dark:text-green-400">{question.correctMeaning}</p>
                                <p className={answer?.meaningCorrect ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                  {answer?.studentMeaning || "-"} {answer?.meaningCorrect ? <Check className="inline w-3 h-3" /> : <X className="inline w-3 h-3" />}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-lg font-bold">
                  總分: {isEditMode ? Object.values(editScores).reduce((a, b) => a + b, 0) : selectedSubmission.totalScore} / 100
                </div>
                {isEditMode && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsEditMode(false)}>
                      取消
                    </Button>
                    <Button onClick={handleSaveScores} disabled={updateScoreMutation.isPending}>
                      {updateScoreMutation.isPending ? "儲存中..." : "儲存變更"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
