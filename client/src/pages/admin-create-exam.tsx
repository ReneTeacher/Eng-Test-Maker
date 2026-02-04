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
  const [words, setWords] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const isAuth = sessionStorage.getItem("adminAuth");
    if (!isAuth) {
      navigate("/admin");
    }
  }, [navigate]);

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; words: string; isActive: boolean }) => {
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
    if (!words.trim()) {
      toast({ title: "Please enter at least one word", variant: "destructive" });
      return;
    }

    createMutation.mutate({ title: title.trim(), words: words.trim(), isActive });
  };

  const wordList = words
    .split("\n")
    .map(w => w.trim())
    .filter(w => w.length > 0);

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
                Enter the exam title and the list of words or sentences
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
                <Label htmlFor="words" className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-muted-foreground" />
                  Words / Sentences
                </Label>
                <Textarea
                  id="words"
                  data-testid="textarea-words"
                  placeholder="Enter each word or sentence on a new line:&#10;apple&#10;banana&#10;The quick brown fox"
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  Each line will become one question. Students must spell it exactly right (case-insensitive).
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

          {wordList.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Preview ({wordList.length} {wordList.length === 1 ? "word" : "words"})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {wordList.map((word, i) => (
                    <Badge key={i} variant="secondary" className="font-mono text-sm">
                      {i + 1}. {word}
                    </Badge>
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
              disabled={createMutation.isPending || !title.trim() || !words.trim()}
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
