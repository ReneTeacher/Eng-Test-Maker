import { storage } from "./server/storage";
import { normalizeChinese } from "./server/routes_helpers"; // I should check if I can extract this or just copy
import OpenAI from "openai";

// Copying necessary logic since this is a one-time script
const poeClient = new OpenAI({
  apiKey: process.env.POE_API_KEY,
  baseURL: "https://api.poe.com/bot/v1",
});

function normalize(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, '')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/「/g, '"')
    .replace(/」/g, '"')
    .replace(/『/g, "'")
    .replace(/』/g, "'")
    .replace(/《/g, '<')
    .replace(/》/g, '>')
    .replace(/【/g, '[')
    .replace(/】/g, ']');
}

async function reScoreAll() {
  console.log("Starting re-scoring of all vocabulary submissions...");
  const exams = await storage.getExams();
  const vocabExams = exams.filter(e => e.examType === "vocab");

  for (const exam of vocabExams) {
    console.log(`Processing exam: ${exam.title} (ID: ${exam.id})`);
    const submissions = await storage.getSubmissionsByExamId(exam.id);
    const questions = await storage.getQuestionsByExamId(exam.id);

    for (const sub of submissions) {
      console.log(`  Processing submission from: ${sub.studentName}`);
      const answers = await storage.getAnswerDetailsBySubmissionId(sub.id);
      let newTotalScore = 0;

      for (const answer of answers) {
        const question = questions.find(q => q.id === answer.questionId);
        if (question) {
          const studentWord = answer.studentWord.trim().toLowerCase();
          const studentPos = answer.studentPos.trim().toLowerCase();
          const studentMeaning = normalize(answer.studentMeaning);

          const correctWords = question.correctWord.split(/[,\/]/).map(w => w.trim().toLowerCase());
          const correctPosList = question.correctPos.split(/[,\/]/).map(p => p.trim().toLowerCase());
          const correctMeanings = question.correctMeaning.split(/[,\/]/).map(m => normalize(m));

          const wordCorrect = correctWords.includes(studentWord);
          const posCorrect = correctPosList.includes(studentPos);
          
          let meaningCorrect = correctMeanings.includes(studentMeaning);
          let earnedScore = 0;

          if (!meaningCorrect && studentMeaning.length > 0) {
            try {
              const prompt = `Compare the student's Chinese meaning with the correct one for the English word "${question.correctWord}".
Determining if they have the same or very similar meaning.
Note: The student might only provide one of multiple correct meanings. As long as the provided meaning is correct and matching one of the correct senses, it should be considered correct.

CORRECT CHINESE MEANING:
${question.correctMeaning}

STUDENT'S CHINESE MEANING:
${answer.studentMeaning}

Respond in this exact JSON format only:
{"isCorrect": <boolean>, "feedback": "<brief feedback in Chinese>"}`;

              const response = await poeClient.chat.completions.create({
                model: "Gemini-3-Flash",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 100,
              });

              const content = response.choices[0]?.message?.content || "";
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.isCorrect) {
                  meaningCorrect = true;
                }
              }
            } catch (error) {
              console.error(`    AI error for ${sub.studentName}:`, error.message);
            }
          }

          if (wordCorrect) earnedScore += question.wordScore;
          if (posCorrect) earnedScore += question.posScore;
          if (meaningCorrect) earnedScore += question.meaningScore;
          
          newTotalScore += earnedScore;
          const isCorrect = wordCorrect && posCorrect && meaningCorrect;

          await storage.updateAnswerDetail(answer.id, {
            isCorrect,
            wordCorrect,
            posCorrect,
            meaningCorrect,
            earnedScore,
          });
        }
      }
      await storage.updateSubmissionScore(sub.id, Math.round(newTotalScore));
    }
  }
  console.log("Re-scoring complete.");
  process.exit(0);
}

reScoreAll().catch(err => {
  console.error(err);
  process.exit(1);
});
