import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, 
  Download, 
  LogOut, 
  Users, 
  FileText, 
  Trash2,
  Copy,
  Eye,
  Zap,
  RefreshCw
} from "lucide-react";
import type { Exam, StudentSubmission, TextSubmission } from "@shared/schema";

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const isAuth = sessionStorage.getItem("adminAuth");
    if (!isAuth) {
      navigate("/admin");
    }
  }, [navigate]);

  const { data: exams, isLoading: examsLoading } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });

  const { data: submissions, isLoading: submissionsLoading } = useQuery<StudentSubmission[]>({
    queryKey: ["/api/submissions"],
  });

  const { data: textSubmissions } = useQuery<TextSubmission[]>({
    queryKey: ["/api/text-submissions"],
  });

  const deleteExamMutation = useMutation({
    mutationFn: async (examId: number) => {
      const response = await apiRequest("DELETE", `/api/exams/${examId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({ title: "Exam deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const rescoreMutation = useMutation({
    mutationFn: async () => {
      const password = prompt("請輸入管理員密碼以進行重新評分：");
      if (!password) throw new Error("Cancelled");
      const response = await apiRequest("POST", "/api/admin/rescore-vocab", { password });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({ title: `重新評分完成，已更新 ${data.updatedSubmissions} 份提交` });
    },
    onError: () => {
      toast({ title: "重新評分失敗", variant: "destructive" });
    },
  });

  const rescoreExamMutation = useMutation({
    mutationFn: async (examId: number) => {
      const response = await apiRequest("POST", `/api/exams/${examId}/rescore`);
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/text-submissions"] });
      toast({ title: `重新批改完成`, description: `已更新 ${data.rescored} 份提交的分數` });
    },
    onError: (error: Error) => {
      toast({ title: "重新批改失敗", description: error.message, variant: "destructive" });
    },
  });

  const handleExport = async (examId?: number) => {
    try {
      const url = examId ? `/api/export?examId=${examId}` : "/api/export";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `dictation-results-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      
      toast({ title: "Export successful" });
    } catch (error) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("adminAuth");
    navigate("/admin");
  };

  const copyExamLink = (examId: number) => {
    const url = `${window.location.origin}/exam/${examId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };


  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Dictation Admin</h1>
              <p className="text-sm text-muted-foreground">Manage exams and view results</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("確定要對所有生字考試的提交紀錄進行智能重新評分嗎？這可能需要一些時間。")) {
                  rescoreMutation.mutate();
                }
              }}
              disabled={rescoreMutation.isPending}
              data-testid="button-rescore"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${rescoreMutation.isPending ? "animate-spin" : ""}`} />
              {rescoreMutation.isPending ? "重新評分中..." : "重新評分"}
            </Button>
            <Link href="/teacher/quick-build">
              <Button variant="outline" data-testid="button-quick-build">
                <Zap className="w-4 h-4 mr-2" />
                快速答案卷建立器
              </Button>
            </Link>
            <Link href="/admin/create-exam">
              <Button data-testid="button-create-exam">
                <Plus className="w-4 h-4 mr-2" />
                Create Exam
              </Button>
            </Link>
            <Button variant="outline" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{exams?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Exams</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(submissions?.length || 0) + (textSubmissions?.length || 0)}</p>
                  <p className="text-sm text-muted-foreground">Total Submissions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg">All Exams</CardTitle>
              <CardDescription>Manage your dictation exams</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {examsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !exams?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No exams created yet</p>
                <Link href="/admin/create-exam">
                  <Button className="mt-4" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Exam
                  </Button>
                </Link>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Student Link</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.map((exam) => {
                    const examSubmissions = (exam.examType === "text" || exam.examType === "passage")
                      ? textSubmissions?.filter(s => s.examId === exam.id) || []
                      : submissions?.filter(s => s.examId === exam.id) || [];
                    return (
                      <TableRow key={exam.id}>
                        <TableCell className="font-medium">{exam.title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {exam.examType === "passage" ? "Passage" : exam.examType === "text" ? "Text" : "Vocab"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate">
                              /exam/{exam.id}
                            </code>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => copyExamLink(exam.id)}
                              title="複製學生連結"
                              data-testid={`button-copy-link-${exam.id}`}
                            >
                              <Copy className="w-4 h-4 text-blue-500" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>{examSubmissions.length}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(exam.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/admin/submissions/${exam.id}`}>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="查看提交記錄"
                                data-testid={`button-submissions-${exam.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Link href={`/admin/edit-exam/${exam.id}`}>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="編輯考試"
                                data-testid={`button-edit-${exam.id}`}
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("確定要重新批改此考試的所有提交嗎？這將使用最新的評分演算法重新計算所有分數。")) {
                                  rescoreExamMutation.mutate(exam.id);
                                }
                              }}
                              disabled={rescoreExamMutation.isPending}
                              title="重新批改"
                              data-testid={`button-rescore-${exam.id}`}
                            >
                              <RefreshCw className={`w-4 h-4 ${rescoreExamMutation.isPending ? "animate-spin" : ""}`} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleExport(exam.id)}
                              title="匯出 Excel"
                              data-testid={`button-export-${exam.id}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Delete this exam and all submissions?")) {
                                  deleteExamMutation.mutate(exam.id);
                                }
                              }}
                              disabled={deleteExamMutation.isPending}
                              title="刪除考試"
                              data-testid={`button-delete-${exam.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
