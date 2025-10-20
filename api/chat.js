import OpenAI from "openai";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Sen Canım HocAIm’sin. Öğrencinin seviyesine göre motive edici, sade ve samimi şekilde anlatırsın." },
        { role: "user", content: message },
      ],
    });

    const answer = response.choices[0].message.content;
    res.json({ reply: answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Bir hata oluştu." });
  }
});

export default app;
