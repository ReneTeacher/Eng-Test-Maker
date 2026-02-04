import { storage } from "./storage";

export async function seedDatabase() {
  // Check if there are already exams
  const existingExams = await storage.getExams();
  if (existingExams.length > 0) {
    console.log("Database already has data, skipping seed");
    return;
  }

  console.log("Seeding database with sample data...");

  // Create a sample exam
  const exam = await storage.createExam({
    title: "Week 1 Vocabulary Test",
    isActive: true,
  });

  // Create sample questions (common English words)
  const words = [
    "apple",
    "beautiful",
    "challenge",
    "development",
    "environment",
    "friendship",
    "government",
    "happiness",
    "imagination",
    "knowledge"
  ];

  const questionData = words.map((word, index) => ({
    examId: exam.id,
    wordOrder: index + 1,
    correctAnswer: word,
  }));

  await storage.createQuestions(questionData);

  console.log(`Created exam "${exam.title}" with ${words.length} words`);
}
