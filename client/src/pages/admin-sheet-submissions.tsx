import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, Users, Trophy, Target, TrendingUp, Download, Eye } from "lucide-react";
import type { AnswerSheetSession, AnswerSheetSubmission, PartItem, QuestionItem } from "@shared/schema";

interface SubmissionWithDetails extends AnswerSheetSubmission {
  answersObj?: Record<string, string>;
}

export default function AdminSheetSubmissions() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionWithDetails | null>(null);

  const { data: session, isLoading: sessionLoading } = useQuery<AnswerSheetSession>({
    queryKey: ["/api/answer-sheets", id],
    queryFn: async () => {
      const res = await fetch(`/api/answer-sheets/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<AnswerSheetSubmission[]>({
    queryKey: ["/api/answer-sheets", id, "submissions"],
    queryFn: async () => {
      const res = await fetch(`/api/answer-sheets/${id}/submissions`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  // Parse items structure
  const parseItems = () => {
    if (!session) return { parts: null, flatQuestions: [] };
    
    try {
      const parsed = JSON.parse(session.itemsJson);
      
      if (Array.isArray(parsed) && parsed.length > 0 && 'partId' in parsed[0]) {
        const parts = parsed as PartItem[];
        interface FlatQ { partId: string; partName: string; question: QuestionItem }
        const flatQuestions: FlatQ[] = [];
        for (const part of parts) {
          for (const q of part.questions) {
            flatQuestions.push({ partId: part.partId, partName: part.partName, question: q });
          }
        }
        return { parts, flatQuestions };
      } else {
        const items = parsed as QuestionItem[];
        interface FlatQ { partId?: string; partName?: string; question: QuestionItem }
        const flatQuestions: FlatQ[] = items.map(q => ({ question: q }));
        return { parts: null, flatQuestions };
      }
    } catch {
      return { parts: null, flatQuestions: [] };
    }
  };

  const { parts, flatQuestions } = parseItems();

  // Filter submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      const matchesSearch = searchQuery === "" ||
        sub.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.studentNumber.toString().includes(searchQuery);
      
      const matchesClass = classFilter === "all" || sub.originalClass === classFilter;
      
      let matchesScore = true;
      if (scoreFilter === "excellent") matchesScore = sub.totalScore >= sub.maxScore * 0.9;
      else if (scoreFilter === "pass") matchesScore = sub.totalScore >= sub.maxScore * 0.6 && sub.totalScore < sub.maxScore * 0.9;
      else if (scoreFilter === "fail") matchesScore = sub.totalScore < sub.maxScore * 0.6;
      
      return matchesSearch && matchesClass && matchesScore;
    });
  }, [submissions, searchQuery, classFilter, scoreFilter]);

  // Analytics
  const analytics = useMemo(() => {
    if (submissions.length === 0) {
      return {
        total: 0,
        avgScore: 0,
        avgPercentage: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
        scoreDistribution: [] as { range: string; count: number }[],
      };
    }

    const scores = submissions.map(s => s.totalScore);
    const percentages = submissions.map(s => (s.totalScore / s.maxScore) * 100);
    const passCount = submissions.filter(s => s.totalScore >= s.maxScore * 0.6).length;

    // Score distribution (10-point buckets)
    const distribution: Record<string, number> = {};
    ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-100"].forEach(r => distribution[r] = 0);
    
    percentages.forEach(p => {
      if (p >= 90) distribution["90-100"]++;
      else if (p >= 80) distribution["80-89"]++;
      else if (p >= 70) distribution["70-79"]++;
      else if (p >= 60) distribution["60-69"]++;
      else if (p >= 50) distribution["50-59"]++;
      else if (p >= 40) distribution["40-49"]++;
      else if (p >= 30) distribution["30-39"]++;
      else if (p >= 20) distribution["20-29"]++;
      else if (p >= 10) distribution["10-19"]++;
      else distribution["0-9"]++;
    });

    return {
      total: submissions.length,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
      avgPercentage: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
      highestScore: Math.max(...scores),
      lowestScore: Math.min(...scores),
      passRate: Math.round((passCount / submissions.length) * 100),
      scoreDistribution: Object.entries(distribution).map(([range, count]) => ({ range, count })),
    };
  }, [submissions]);

  // Per-question analysis
  const questionAnalysis = useMemo(() => {
    if (submissions.length === 0 || flatQuestions.length === 0) return [];

    return flatQuestions.map(({ partId, partName, question }) => {
      const key = partId ? `${partId}:${question.id}` : String(question.id);
      let correctCount = 0;

      submissions.forEach((sub) => {
        try {
          const answers = JSON.parse(sub.answersJson);
          const studentAnswer = answers[key] || answers[String(question.id)];
          if (studentAnswer && studentAnswer.trim().toLowerCase() === question.correct.trim().toLowerCase()) {
            correctCount++;
          }
        } catch {}
      });

      return {
        partName: partName || "Questions",
        questionId: question.id,
        correct: question.correct,
        correctCount,
        correctRate: Math.round((correctCount / submissions.length) * 100),
      };
    });
  }, [submissions, flatQuestions]);

  const handleExport = () => {
    const headers = ["姓名", "學號", "班級", "得分", "滿分", "百分比", "提交時間"];
    const rows = filteredSubmissions.map(s => [
      s.studentName,
      s.studentNumber,
      s.originalClass,
      s.totalScore,
      s.maxScore,
      `${Math.round((s.totalScore / s.maxScore) * 100)}%`,
      new Date(s.submittedAt).toLocaleString("zh-TW"),
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session?.title || "answer-sheet"}-submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (sessionLoading || submissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">載入中...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive">找不到此答案卷</p>
            <Button className="mt-4" onClick={() => navigate("/admin/dashboard")}>返回後台</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show submission detail modal
  if (selectedSubmission) {
    const answersObj = JSON.parse(selectedSubmission.answersJson);
    
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedSubmission(null)} data-testid="button-back-detail">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedSubmission.studentName} 的答題詳情</h1>
              <p className="text-muted-foreground">
                {selectedSubmission.originalClass} - 學號 {selectedSubmission.studentNumber} | 
                得分: {selectedSubmission.totalScore}/{selectedSubmission.maxScore} ({Math.round((selectedSubmission.totalScore / selectedSubmission.maxScore) * 100)}%)
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>答題記錄</CardTitle>
            </CardHeader>
            <CardContent>
              {parts ? (
                parts.map((part) => (
                  <div key={part.partId} className="mb-6">
                    <h4 className="font-semibold text-primary mb-3">{part.partName}</h4>
                    <div className="space-y-2">
                      {part.questions.map((q) => {
                        const key = `${part.partId}:${q.id}`;
                        const studentAnswer = answersObj[key] || answersObj[String(q.id)] || "(未作答)";
                        const isCorrect = studentAnswer.trim().toLowerCase() === q.correct.trim().toLowerCase();
                        return (
                          <div key={key} className={`flex items-center gap-3 p-2 rounded ${isCorrect ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                            <span className="w-12 font-medium">Q{q.id}</span>
                            <Badge variant={isCorrect ? "default" : "destructive"}>
                              {isCorrect ? "正確" : "錯誤"}
                            </Badge>
                            <span className="flex-1">
                              學生答案: <span className="font-mono">{studentAnswer}</span>
                            </span>
                            {!isCorrect && (
                              <span className="text-muted-foreground">
                                正確答案: <span className="font-mono text-green-600">{q.correct}</span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="space-y-2">
                  {flatQuestions.map(({ question }) => {
                    const key = String(question.id);
                    const studentAnswer = answersObj[key] || "(未作答)";
                    const isCorrect = studentAnswer.trim().toLowerCase() === question.correct.trim().toLowerCase();
                    return (
                      <div key={key} className={`flex items-center gap-3 p-2 rounded ${isCorrect ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                        <span className="w-12 font-medium">Q{question.id}</span>
                        <Badge variant={isCorrect ? "default" : "destructive"}>
                          {isCorrect ? "正確" : "錯誤"}
                        </Badge>
                        <span className="flex-1">
                          學生答案: <span className="font-mono">{studentAnswer}</span>
                        </span>
                        {!isCorrect && (
                          <span className="text-muted-foreground">
                            正確答案: <span className="font-mono text-green-600">{question.correct}</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/quick-build")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{session.title}</h1>
            <p className="text-muted-foreground">提交紀錄與分析</p>
          </div>
          <Button variant="outline" onClick={handleExport} data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            匯出 CSV
          </Button>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{analytics.total}</p>
                  <p className="text-sm text-muted-foreground">提交人數</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Target className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{analytics.avgPercentage}%</p>
                  <p className="text-sm text-muted-foreground">平均分數</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Trophy className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{analytics.highestScore}</p>
                  <p className="text-sm text-muted-foreground">最高分</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{analytics.passRate}%</p>
                  <p className="text-sm text-muted-foreground">及格率</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>分數分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-32">
              {analytics.scoreDistribution.map(({ range, count }) => {
                const maxCount = Math.max(...analytics.scoreDistribution.map(d => d.count), 1);
                const height = (count / maxCount) * 100;
                return (
                  <div key={range} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground">{count}</span>
                    <div 
                      className="w-full bg-primary/80 rounded-t transition-all"
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{range}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Question Analysis */}
        {questionAnalysis.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>題目正確率分析</CardTitle>
              <CardDescription>每題的答對率統計</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part</TableHead>
                      <TableHead>題號</TableHead>
                      <TableHead>正確答案</TableHead>
                      <TableHead>答對人數</TableHead>
                      <TableHead>正確率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questionAnalysis.map((q, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground">{q.partName}</TableCell>
                        <TableCell className="font-medium">Q{q.questionId}</TableCell>
                        <TableCell className="font-mono">{q.correct}</TableCell>
                        <TableCell>{q.correctCount}/{submissions.length}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-muted rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${q.correctRate >= 60 ? 'bg-green-500' : q.correctRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${q.correctRate}%` }}
                              />
                            </div>
                            <span className="text-sm">{q.correctRate}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submissions List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>提交紀錄</CardTitle>
              <CardDescription>共 {filteredSubmissions.length} 筆</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋姓名或學號..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-32" data-testid="select-class-filter">
                  <SelectValue placeholder="班級" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部班級</SelectItem>
                  <SelectItem value="J3A">J3A</SelectItem>
                  <SelectItem value="J3B">J3B</SelectItem>
                  <SelectItem value="J3C">J3C</SelectItem>
                </SelectContent>
              </Select>
              <Select value={scoreFilter} onValueChange={setScoreFilter}>
                <SelectTrigger className="w-32" data-testid="select-score-filter">
                  <SelectValue placeholder="分數" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="excellent">優秀 (≥90%)</SelectItem>
                  <SelectItem value="pass">及格 (60-89%)</SelectItem>
                  <SelectItem value="fail">不及格 (&lt;60%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredSubmissions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">尚無提交紀錄</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>姓名</TableHead>
                      <TableHead>學號</TableHead>
                      <TableHead>班級</TableHead>
                      <TableHead>得分</TableHead>
                      <TableHead>百分比</TableHead>
                      <TableHead>提交時間</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((sub) => {
                      const percentage = Math.round((sub.totalScore / sub.maxScore) * 100);
                      return (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">{sub.studentName}</TableCell>
                          <TableCell>{sub.studentNumber}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{sub.originalClass}</Badge>
                          </TableCell>
                          <TableCell>{sub.totalScore}/{sub.maxScore}</TableCell>
                          <TableCell>
                            <Badge variant={percentage >= 60 ? "default" : "destructive"}>
                              {percentage}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(sub.submittedAt).toLocaleString("zh-TW")}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedSubmission(sub)}
                              data-testid={`button-view-${sub.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
