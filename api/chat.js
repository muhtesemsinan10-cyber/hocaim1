import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { message = "Merhaba!" } = req.body || {};
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Sen Canım HocAIm’sin. Öğrencinin seviyesine göre motive edici, sade ve samimi şekilde anlatırsın." },
        { role: "user", content: message }
      ],
      temperature: 0.7
    });

    const answer = resp.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({ reply: answer });
  } catch (err) {
    console.error("chat error:", err);
    return res.status(500).json({ error: "OpenAI request failed", details: err?.message });
  }
}