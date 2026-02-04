import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, User, Hash, School, Users } from "lucide-react";

const STUDENT_NUMBERS = Array.from({ length: 40 }, (_, i) => i + 1);
const ORIGINAL_CLASSES = ["J3A", "J3B", "J3C"];
const MIXED_CLASSES = ["初三英文1班", "初三英文2班", "初三英文3班"];

export default function StudentLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState<string>("");
  const [originalClass, setOriginalClass] = useState<string>("");
  const [mixedClass, setMixedClass] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!studentName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }
    if (!studentNumber) {
      toast({ title: "Please select your student number", variant: "destructive" });
      return;
    }
    if (!originalClass) {
      toast({ title: "Please select your original class", variant: "destructive" });
      return;
    }
    if (!mixedClass) {
      toast({ title: "Please select your mixed class", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    // Store student info in sessionStorage
    const studentInfo = {
      studentName: studentName.trim(),
      studentNumber: parseInt(studentNumber),
      originalClass,
      mixedClass,
    };
    sessionStorage.setItem("studentInfo", JSON.stringify(studentInfo));
    
    navigate("/exam");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">English Dictation</h1>
          <p className="text-muted-foreground">Enter your details to start the test</p>
        </div>

        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <User className="w-5 h-5" />
              Student Login
            </CardTitle>
            <CardDescription>Please fill in all fields to proceed</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Name
                </Label>
                <Input
                  id="name"
                  data-testid="input-student-name"
                  placeholder="Enter your full name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="number" className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  Student Number
                </Label>
                <Select value={studentNumber} onValueChange={setStudentNumber}>
                  <SelectTrigger id="number" data-testid="select-student-number" className="h-11">
                    <SelectValue placeholder="Select your number (1-40)" />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDENT_NUMBERS.map((num) => (
                      <SelectItem key={num} value={num.toString()} data-testid={`option-number-${num}`}>
                        {num}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="originalClass" className="flex items-center gap-2">
                  <School className="w-4 h-4 text-muted-foreground" />
                  Original Class
                </Label>
                <Select value={originalClass} onValueChange={setOriginalClass}>
                  <SelectTrigger id="originalClass" data-testid="select-original-class" className="h-11">
                    <SelectValue placeholder="Select your original class" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGINAL_CLASSES.map((cls) => (
                      <SelectItem key={cls} value={cls} data-testid={`option-class-${cls}`}>
                        {cls}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mixedClass" className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Mixed Class
                </Label>
                <Select value={mixedClass} onValueChange={setMixedClass}>
                  <SelectTrigger id="mixedClass" data-testid="select-mixed-class" className="h-11">
                    <SelectValue placeholder="Select your mixed class" />
                  </SelectTrigger>
                  <SelectContent>
                    {MIXED_CLASSES.map((cls) => (
                      <SelectItem key={cls} value={cls} data-testid={`option-mixed-${cls}`}>
                        {cls}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 text-base font-medium"
                disabled={isLoading}
                data-testid="button-start-exam"
              >
                {isLoading ? "Loading..." : "Start Dictation Test"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Teachers:{" "}
          <a 
            href="/admin" 
            className="text-primary hover:underline"
            data-testid="link-admin"
          >
            Access Admin Panel
          </a>
        </p>
      </div>
    </div>
  );
}
