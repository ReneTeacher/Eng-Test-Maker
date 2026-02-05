import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Plus, Trash2, Save, Copy, Eye, BarChart3, Edit2 } from "lucide-react";
import type { QuestionItem, PartItem, AnswerSheetSession } from "@shared/schema";

export default function TeacherQuickBuild() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [paperLink, setPaperLink] = useState("");
  const [parts, setParts] = useState<PartItem[]>([
    { partId: "part-1", partName: "Part A", questions: [] }
  ]);
  const [activePartId, setActivePartId] = useState("part-1");
  
  const [mcStartNum, setMcStartNum] = useState(1);
  const [mcEndNum, setMcEndNum] = useState(10);
  const [mcOptions, setMcOptions] = useState<"A-D" | "A-E">("A-D");
  const [mcAnswerString, setMcAnswerString] = useState("");
  
  const [fibStartNum, setFibStartNum] = useState(1);
  const [fibEndNum, setFibEndNum] = useState(10);
  const [fibAnswers, setFibAnswers] = useState("");

  const { data: sheets = [] } = useQuery<AnswerSheetSession[]>({
    queryKey: ["/api/answer-sheets"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; paperLink: string; parts: PartItem[] }) => {
      const response = await apiRequest("POST", "/api/answer-sheets", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/answer-sheets"] });
      toast({ title: "答案卷已建立", description: "可以分享連結給學生了" });
      setTitle("");
      setPaperLink("");
      setParts([{ partId: "part-1", partName: "Part A", questions: [] }]);
      setActivePartId("part-1");
    },
    onError: () => {
      toast({ title: "建立失敗", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/answer-sheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/answer-sheets"] });
      toast({ title: "已刪除" });
    },
  });

  const activePart = parts.find(p => p.partId === activePartId);

  const addPart = () => {
    const newPartId = `part-${Date.now()}`;
    const partLetter = String.fromCharCode(65 + parts.length);
    setParts([...parts, { partId: newPartId, partName: `Part ${partLetter}`, questions: [] }]);
    setActivePartId(newPartId);
    toast({ title: "已新增 Part" });
  };

  const removePart = (partId: string) => {
    if (parts.length <= 1) {
      toast({ title: "至少需要一個 Part", variant: "destructive" });
      return;
    }
    const newParts = parts.filter(p => p.partId !== partId);
    setParts(newParts);
    if (activePartId === partId) {
      setActivePartId(newParts[0].partId);
    }
    toast({ title: "已刪除 Part" });
  };

  const updatePartName = (partId: string, newName: string) => {
    setParts(parts.map(p => p.partId === partId ? { ...p, partName: newName } : p));
  };

  const generateMcQuestions = () => {
    if (!activePart) return;
    
    const answers = mcAnswerString.toUpperCase().replace(/[^A-E]/g, "");
    const count = mcEndNum - mcStartNum + 1;
    
    if (answers.length < count) {
      toast({ title: "答案不足", description: `需要 ${count} 個答案，只有 ${answers.length} 個`, variant: "destructive" });
      return;
    }
    
    const options = mcOptions === "A-D" ? ["A", "B", "C", "D"] : ["A", "B", "C", "D", "E"];
    const newItems: QuestionItem[] = [];
    
    for (let i = 0; i < count; i++) {
      const questionNum = mcStartNum + i;
      const answer = answers[i];
      
      if (!options.includes(answer)) {
        toast({ title: "無效答案", description: `第 ${questionNum} 題答案 "${answer}" 不在選項範圍內`, variant: "destructive" });
        return;
      }
      
      newItems.push({
        id: questionNum,
        type: "mc",
        correct: answer,
        options,
      });
    }
    
    const existingIds = new Set(newItems.map(item => item.id));
    const filtered = activePart.questions.filter(item => !existingIds.has(item.id));
    const merged = [...filtered, ...newItems].sort((a, b) => a.id - b.id);
    
    setParts(parts.map(p => p.partId === activePartId ? { ...p, questions: merged } : p));
    toast({ title: "已生成", description: `${newItems.length} 題選擇題` });
    setMcAnswerString("");
  };

  const generateFibQuestions = () => {
    if (!activePart) return;
    
    const lines = fibAnswers.split("\n").map(line => line.trim()).filter(line => line.length > 0);
    const count = fibEndNum - fibStartNum + 1;
    
    if (lines.length < count) {
      toast({ title: "答案不足", description: `需要 ${count} 個答案，只有 ${lines.length} 個`, variant: "destructive" });
      return;
    }
    
    const newItems: QuestionItem[] = [];
    
    for (let i = 0; i < count; i++) {
      const questionNum = fibStartNum + i;
      newItems.push({
        id: questionNum,
        type: "text",
        correct: lines[i],
      });
    }
    
    const existingIds = new Set(newItems.map(item => item.id));
    const filtered = activePart.questions.filter(item => !existingIds.has(item.id));
    const merged = [...filtered, ...newItems].sort((a, b) => a.id - b.id);
    
    setParts(parts.map(p => p.partId === activePartId ? { ...p, questions: merged } : p));
    toast({ title: "已生成", description: `${newItems.length} 題填充題` });
    setFibAnswers("");
  };

  const removeItem = (partId: string, questionId: number) => {
    setParts(parts.map(p => 
      p.partId === partId 
        ? { ...p, questions: p.questions.filter(q => q.id !== questionId) }
        : p
    ));
  };

  const editItemAnswer = (partId: string, questionId: number, newAnswer: string) => {
    setParts(parts.map(p => 
      p.partId === partId 
        ? { ...p, questions: p.questions.map(q => q.id === questionId ? { ...q, correct: newAnswer } : q) }
        : p
    ));
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "請輸入標題", variant: "destructive" });
      return;
    }
    if (!paperLink.trim()) {
      toast({ title: "請輸入試卷連結", variant: "destructive" });
      return;
    }
    const totalQuestions = parts.reduce((sum, p) => sum + p.questions.length, 0);
    if (totalQuestions === 0) {
      toast({ title: "請至少添加一題", variant: "destructive" });
      return;
    }
    
    createMutation.mutate({ title, paperLink, parts });
  };

  const copyLink = (id: number) => {
    const url = `${window.location.origin}/sheet/${id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "已複製連結" });
  };

  const totalQuestions = parts.reduce((sum, p) => sum + p.questions.length, 0);

  const getItemCount = (sheet: AnswerSheetSession) => {
    try {
      const parsed = JSON.parse(sheet.itemsJson);
      if (Array.isArray(parsed) && parsed.length > 0 && 'partId' in parsed[0]) {
        return (parsed as PartItem[]).reduce((sum, p) => sum + p.questions.length, 0);
      }
      return (parsed as QuestionItem[]).length;
    } catch {
      return 0;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">快速答案卷建立器</h1>
            <p className="text-muted-foreground">支援多 Part 結構，每個 Part 獨立題號</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>基本資料</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">答案卷標題</Label>
                  <Input
                    id="title"
                    placeholder="例如：Unit 5 Quiz"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="input-title"
                  />
                </div>
                <div>
                  <Label htmlFor="paperLink">試卷連結 (Google Drive PDF/Image)</Label>
                  <Input
                    id="paperLink"
                    placeholder="https://drive.google.com/..."
                    value={paperLink}
                    onChange={(e) => setPaperLink(e.target.value)}
                    data-testid="input-paper-link"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Part 管理</CardTitle>
                  <CardDescription>每個 Part 有獨立的題號 (1, 2, 3...)</CardDescription>
                </div>
                <Button size="sm" onClick={addPart} data-testid="button-add-part">
                  <Plus className="h-4 w-4 mr-1" />
                  新增 Part
                </Button>
              </CardHeader>
              <CardContent>
                <Tabs value={activePartId} onValueChange={setActivePartId}>
                  <TabsList className="flex flex-wrap h-auto gap-1">
                    {parts.map((part) => (
                      <TabsTrigger key={part.partId} value={part.partId} className="relative" data-testid={`tab-${part.partId}`}>
                        {part.partName} ({part.questions.length})
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {parts.map((part) => (
                    <TabsContent key={part.partId} value={part.partId} className="space-y-4 mt-4">
                      <div className="flex items-center gap-2">
                        <Label className="shrink-0">Part 名稱:</Label>
                        <Input
                          value={part.partName}
                          onChange={(e) => updatePartName(part.partId, e.target.value)}
                          placeholder="例如: Part A: Vocabulary"
                          data-testid={`input-part-name-${part.partId}`}
                        />
                        {parts.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removePart(part.partId)}
                            data-testid={`button-remove-part-${part.partId}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>選擇題批量生成器</CardTitle>
                <CardDescription>為 "{activePart?.partName}" 生成選擇題</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>起始題號</Label>
                    <Input
                      type="number"
                      min={1}
                      value={mcStartNum}
                      onChange={(e) => setMcStartNum(parseInt(e.target.value) || 1)}
                      data-testid="input-mc-start"
                    />
                  </div>
                  <div>
                    <Label>結束題號</Label>
                    <Input
                      type="number"
                      min={1}
                      value={mcEndNum}
                      onChange={(e) => setMcEndNum(parseInt(e.target.value) || 10)}
                      data-testid="input-mc-end"
                    />
                  </div>
                  <div>
                    <Label>選項模式</Label>
                    <Select value={mcOptions} onValueChange={(v) => setMcOptions(v as "A-D" | "A-E")}>
                      <SelectTrigger data-testid="select-mc-options">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A-D">A-D (4選項)</SelectItem>
                        <SelectItem value="A-E">A-E (5選項)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>答案字串 (例如: ABCDABCD...)</Label>
                  <Textarea
                    placeholder="輸入連續的答案字母，例如 ABCDABCDAB"
                    value={mcAnswerString}
                    onChange={(e) => setMcAnswerString(e.target.value)}
                    className="font-mono"
                    data-testid="input-mc-answers"
                  />
                </div>
                <Button onClick={generateMcQuestions} className="w-full" data-testid="button-generate-mc">
                  <Plus className="h-4 w-4 mr-2" />
                  生成選擇題到 {activePart?.partName}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>填充題批量生成器</CardTitle>
                <CardDescription>為 "{activePart?.partName}" 生成填充題</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>起始題號</Label>
                    <Input
                      type="number"
                      min={1}
                      value={fibStartNum}
                      onChange={(e) => setFibStartNum(parseInt(e.target.value) || 1)}
                      data-testid="input-fib-start"
                    />
                  </div>
                  <div>
                    <Label>結束題號</Label>
                    <Input
                      type="number"
                      min={1}
                      value={fibEndNum}
                      onChange={(e) => setFibEndNum(parseInt(e.target.value) || 10)}
                      data-testid="input-fib-end"
                    />
                  </div>
                </div>
                <div>
                  <Label>答案 (每行一個)</Label>
                  <Textarea
                    placeholder="apple&#10;banana&#10;cherry&#10;..."
                    value={fibAnswers}
                    onChange={(e) => setFibAnswers(e.target.value)}
                    rows={5}
                    data-testid="input-fib-answers"
                  />
                </div>
                <Button onClick={generateFibQuestions} className="w-full" data-testid="button-generate-fib">
                  <Plus className="h-4 w-4 mr-2" />
                  生成填充題到 {activePart?.partName}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>題目預覽</CardTitle>
                  <CardDescription>共 {parts.length} 個 Part，{totalQuestions} 題</CardDescription>
                </div>
                <Button 
                  onClick={handleSave} 
                  disabled={createMutation.isPending || totalQuestions === 0}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 mr-2" />
                  儲存答案卷
                </Button>
              </CardHeader>
              <CardContent>
                {totalQuestions === 0 ? (
                  <p className="text-muted-foreground text-center py-8">尚未添加任何題目</p>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto space-y-4">
                    {parts.map((part) => (
                      part.questions.length > 0 && (
                        <div key={part.partId}>
                          <h4 className="font-semibold text-sm mb-2 text-primary">{part.partName}</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">題號</TableHead>
                                <TableHead className="w-24">類型</TableHead>
                                <TableHead>正確答案</TableHead>
                                <TableHead className="w-16"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {part.questions.map((item) => (
                                <TableRow key={`${part.partId}-${item.id}`}>
                                  <TableCell className="font-medium">{item.id}</TableCell>
                                  <TableCell>
                                    <span className={`px-2 py-1 rounded text-xs ${
                                      item.type === "mc" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                    }`}>
                                      {item.type === "mc" ? "選擇題" : "填充題"}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={item.correct}
                                      onChange={(e) => editItemAnswer(part.partId, item.id, e.target.value)}
                                      className="h-8"
                                      data-testid={`input-answer-${part.partId}-${item.id}`}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeItem(part.partId, item.id)}
                                      data-testid={`button-remove-${part.partId}-${item.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>已建立的答案卷</CardTitle>
              </CardHeader>
              <CardContent>
                {sheets.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">尚無答案卷</p>
                ) : (
                  <div className="space-y-2">
                    {sheets.map((sheet) => {
                      const itemCount = getItemCount(sheet);
                      return (
                        <div key={sheet.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div>
                            <p className="font-medium">{sheet.title}</p>
                            <p className="text-sm text-muted-foreground">{itemCount} 題</p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyLink(sheet.id)}
                              title="複製學生連結"
                              data-testid={`button-copy-${sheet.id}`}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(`/sheet/${sheet.id}`, "_blank")}
                              title="預覽學生頁面"
                              data-testid={`button-preview-${sheet.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/admin/sheet-submissions/${sheet.id}`)}
                              title="查看提交紀錄"
                              data-testid={`button-submissions-${sheet.id}`}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("確定要刪除此答案卷嗎？")) {
                                  deleteMutation.mutate(sheet.id);
                                }
                              }}
                              data-testid={`button-delete-${sheet.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
