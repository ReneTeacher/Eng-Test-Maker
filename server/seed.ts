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

  // Create sample vocabulary questions with word, POS, and meaning
  const vocabularies = [
    { word: "Apple", pos: "n.", meaning: "蘋果" },
    { word: "Beautiful", pos: "adj.", meaning: "美麗的" },
    { word: "Challenge", pos: "n.", meaning: "挑戰" },
    { word: "Development", pos: "n.", meaning: "發展" },
    { word: "Environment", pos: "n.", meaning: "環境" },
    { word: "Friendship", pos: "n.", meaning: "友誼" },
    { word: "Government", pos: "n.", meaning: "政府" },
    { word: "Happiness", pos: "n.", meaning: "幸福" },
    { word: "Imagination", pos: "n.", meaning: "想像力" },
    { word: "Knowledge", pos: "n.", meaning: "知識" }
  ];

  const questionData = vocabularies.map((vocab, index) => ({
    examId: exam.id,
    wordOrder: index + 1,
    correctWord: vocab.word,
    correctPos: vocab.pos,
    correctMeaning: vocab.meaning,
  }));

  await storage.createQuestions(questionData);

  console.log(`Created exam "${exam.title}" with ${vocabularies.length} vocabularies`);
}
