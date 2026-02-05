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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Plus, Trash2, Save, Copy, ExternalLink, Eye } from "lucide-react";
import type { QuestionItem, AnswerSheetSession } from "@shared/schema";

export default function TeacherQuickBuild() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [paperLink, setPaperLink] = useState("");
  const [items, setItems] = useState<QuestionItem[]>([]);
  
  // Bulk MC Generator state
  const [mcStartNum, setMcStartNum] = useState(1);
  const [mcEndNum, setMcEndNum] = useState(10);
  const [mcOptions, setMcOptions] = useState<"A-D" | "A-E">("A-D");
  const [mcAnswerString, setMcAnswerString] = useState("");
  
  // Bulk Fill-in-Blank Generator state
  const [fibStartNum, setFibStartNum] = useState(1);
  const [fibEndNum, setFibEndNum] = useState(10);
  const [fibAnswers, setFibAnswers] = useState("");

  // Fetch existing answer sheets
  const { data: sheets = [] } = useQuery<AnswerSheetSession[]>({
    queryKey: ["/api/answer-sheets"],
  });

  // Create answer sheet mutation
  const createMutation = useMutation({
    mutationFn: async (data: { title: string; paperLink: string; items: QuestionItem[] }) => {
      const response = await apiRequest("POST", "/api/answer-sheets", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/answer-sheets"] });
      toast({ title: "答案卷已建立", description: "可以分享連結給學生了" });
      setTitle("");
      setPaperLink("");
      setItems([]);
    },
    onError: () => {
      toast({ title: "建立失敗", variant: "destructive" });
    },
  });

  // Delete answer sheet mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/answer-sheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/answer-sheets"] });
      toast({ title: "已刪除" });
    },
  });

  // Generate MC questions from answer string
  const generateMcQuestions = () => {
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
    
    // Merge with existing items (replace if same id, otherwise add)
    const existingIds = new Set(newItems.map(item => item.id));
    const filtered = items.filter(item => !existingIds.has(item.id));
    const merged = [...filtered, ...newItems].sort((a, b) => a.id - b.id);
    setItems(merged);
    
    toast({ title: "已生成", description: `${newItems.length} 題選擇題` });
    setMcAnswerString("");
  };

  // Generate Fill-in-Blank questions from answers
  const generateFibQuestions = () => {
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
    
    // Merge with existing items
    const existingIds = new Set(newItems.map(item => item.id));
    const filtered = items.filter(item => !existingIds.has(item.id));
    const merged = [...filtered, ...newItems].sort((a, b) => a.id - b.id);
    setItems(merged);
    
    toast({ title: "已生成", description: `${newItems.length} 題填充題` });
    setFibAnswers("");
  };

  // Remove a single item
  const removeItem = (id: number) => {
    setItems(items.filter(item => item.id !== id));
  };

  // Edit an item's correct answer
  const editItemAnswer = (id: number, newAnswer: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, correct: newAnswer } : item
    ));
  };

  // Save the answer sheet
  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "請輸入標題", variant: "destructive" });
      return;
    }
    if (!paperLink.trim()) {
      toast({ title: "請輸入試卷連結", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "請至少添加一題", variant: "destructive" });
      return;
    }
    
    createMutation.mutate({ title, paperLink, items });
  };

  // Copy student link
  const copyLink = (id: number) => {
    const url = `${window.location.origin}/sheet/${id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "已複製連結" });
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
            <p className="text-muted-foreground">批量建立選擇題和填充題答案卷</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: Build Tools */}
          <div className="space-y-4">
            {/* Basic Info */}
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

            {/* Tool A: Bulk MC Generator */}
            <Card>
              <CardHeader>
                <CardTitle>選擇題批量生成器</CardTitle>
                <CardDescription>輸入答案字串，自動生成多題選擇題</CardDescription>
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
                  生成選擇題
                </Button>
              </CardContent>
            </Card>

            {/* Tool B: Bulk Fill-in-Blank Generator */}
            <Card>
              <CardHeader>
                <CardTitle>填充題批量生成器</CardTitle>
                <CardDescription>每行一個答案，自動對應題號</CardDescription>
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
                  生成填充題
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview & Save */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>題目預覽</CardTitle>
                  <CardDescription>共 {items.length} 題</CardDescription>
                </div>
                <Button 
                  onClick={handleSave} 
                  disabled={createMutation.isPending || items.length === 0}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 mr-2" />
                  儲存答案卷
                </Button>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">尚未添加任何題目</p>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto">
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
                        {items.map((item) => (
                          <TableRow key={item.id}>
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
                                onChange={(e) => editItemAnswer(item.id, e.target.value)}
                                className="h-8"
                                data-testid={`input-answer-${item.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(item.id)}
                                data-testid={`button-remove-${item.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Existing Answer Sheets */}
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
                      const itemCount = JSON.parse(sheet.itemsJson).length;
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
                              onClick={() => window.open(sheet.paperLink, "_blank")}
                              title="查看試卷"
                              data-testid={`button-paper-${sheet.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
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
