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
  CheckCircle, 
  Clock,
  ToggleLeft,
  ToggleRight,
  Trash2
} from "lucide-react";
import type { Exam, StudentSubmission } from "@shared/schema";

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

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ examId, isActive }: { examId: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/exams/${examId}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({ title: "Exam status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
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

  const activeExam = exams?.find(e => e.isActive);
  const activeExamSubmissions = submissions?.filter(s => s.examId === activeExam?.id) || [];

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
        <div className="grid gap-4 md:grid-cols-3">
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
                  <p className="text-2xl font-bold">{submissions?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Submissions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeExam ? 1 : 0}</p>
                  <p className="text-sm text-muted-foreground">Active Exam</p>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.map((exam) => {
                    const examSubmissions = submissions?.filter(s => s.examId === exam.id) || [];
                    return (
                      <TableRow key={exam.id}>
                        <TableCell className="font-medium">{exam.title}</TableCell>
                        <TableCell>
                          {exam.isActive ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>{examSubmissions.length}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(exam.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/admin/edit-exam/${exam.id}`}>
                              <Button
                                size="sm"
                                variant="ghost"
                                data-testid={`button-edit-${exam.id}`}
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleActiveMutation.mutate({ 
                                examId: exam.id, 
                                isActive: !exam.isActive 
                              })}
                              disabled={toggleActiveMutation.isPending}
                              data-testid={`button-toggle-${exam.id}`}
                            >
                              {exam.isActive ? (
                                <ToggleRight className="w-4 h-4 text-green-500" />
                              ) : (
                                <ToggleLeft className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleExport(exam.id)}
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

        {activeExam && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Current Exam Submissions
                </CardTitle>
                <CardDescription>
                  Students who submitted "{activeExam.title}"
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                onClick={() => handleExport(activeExam.id)}
                disabled={!activeExamSubmissions.length}
                data-testid="button-export-current"
              >
                <Download className="w-4 h-4 mr-2" />
                Export to Excel
              </Button>
            </CardHeader>
            <CardContent>
              {submissionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !activeExamSubmissions.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No submissions yet</p>
                  <p className="text-sm">Waiting for students to complete the test</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Original Class</TableHead>
                      <TableHead>Mixed Class</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeExamSubmissions.map((sub) => (
                      <TableRow key={sub.id} data-testid={`row-submission-${sub.id}`}>
                        <TableCell className="font-medium">{sub.studentName}</TableCell>
                        <TableCell>{sub.studentNumber}</TableCell>
                        <TableCell>{sub.originalClass}</TableCell>
                        <TableCell>{sub.mixedClass}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{sub.totalScore}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(sub.submittedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
