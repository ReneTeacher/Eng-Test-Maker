import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import StudentLogin from "@/pages/student-login";
import StudentExam from "@/pages/student-exam";
import ThankYou from "@/pages/thank-you";
import AdminLogin from "@/pages/admin-login";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminCreateExam from "@/pages/admin-create-exam";

function Router() {
  return (
    <Switch>
      <Route path="/" component={StudentLogin} />
      <Route path="/exam" component={StudentExam} />
      <Route path="/thank-you" component={ThankYou} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/create-exam" component={AdminCreateExam} />
      <Route path="/admin/edit-exam/:id" component={AdminCreateExam} />
      <Route path="/exam/:id" component={StudentExam} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
