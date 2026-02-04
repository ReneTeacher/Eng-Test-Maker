import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Save, FileText, ListOrdered, Eye } from "lucide-react";

export default function AdminCreateExam() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [vocabularies, setVocabularies] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const isAuth = sessionStorage.getItem("adminAuth");
    if (!isAuth) {
      navigate("/admin");
    }
  }, [navigate]);

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; vocabularies: string; isActive: boolean }) => {
      const response = await apiRequest("POST", "/api/exams", data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create exam");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({ title: "Exam created successfully" });
      navigate("/admin/dashboard");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to create exam", 
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
    if (!vocabularies.trim()) {
      toast({ title: "Please enter at least one vocabulary entry", variant: "destructive" });
      return;
    }

    createMutation.mutate({ title: title.trim(), vocabularies: vocabularies.trim(), isActive });
  };

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
            <h1 className="font-bold text-lg">Create New Exam</h1>
            <p className="text-sm text-muted-foreground">Add a dictation test for students</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Exam Details
              </CardTitle>
              <CardDescription>
                Enter the exam title and vocabulary list in format: Word | POS | Meaning
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="title">Exam Title</Label>
                <Input
                  id="title"
                  data-testid="input-exam-title"
                  placeholder="e.g., Week 1 Dictation"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vocabularies" className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-muted-foreground" />
                  Vocabulary List
                </Label>
                <Textarea
                  id="vocabularies"
                  data-testid="textarea-vocabularies"
                  placeholder="Enter one vocabulary per line in format: Word | POS | Meaning&#10;&#10;Example:&#10;Apple | n. | 蘋果&#10;Run | v. | 跑&#10;Beautiful | adj. | 美麗的"
                  value={vocabularies}
                  onChange={(e) => setVocabularies(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  Format: Word | Part of Speech | Chinese Meaning. Each line is one question. Students must answer all 3 parts correctly.
                </p>
              </div>

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

          {vocabList.length > 0 && (
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
              disabled={createMutation.isPending || !title.trim() || !vocabularies.trim()}
              data-testid="button-save-exam"
            >
              {createMutation.isPending ? (
                "Creating..."
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Create Exam
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
