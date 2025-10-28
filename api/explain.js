// /api/explain.js
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { prompt, topic, style, level, stream } = body || {};

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = {
      role: "system",
      content:
        "Sen 'HocAIm'sin. Türkçe konuşan, seviyeyi dikkate alan, sabırlı ve motive edici bir öğretmensin. " +
        "Gereksiz süsleme yapma; açık, adım adım anlat. Öğrenci anlamazsa farklı yollar dener, örnek verirsin."
    };

    const user = {
      role: "user",
      content:
        `KONU: ${topic || "Genel"}\n` +
        `ÖĞRENCİ SEVİYESİ: ${level || "Lise"}\n` +
        `ÖĞRENME STİLİ: ${style || "Otomatik"}\n\n` +
        (prompt || "Konuya uygun kısa bir giriş yap.")
    };

    // STREAM yolu
    if (stream === true || stream === "true" || stream === 1 || stream === "1") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Transfer-Encoding", "chunked");

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        stream: true,
        messages: [system, user],
      });

      for await (const part of completion) {
        const token = part.choices?.[0]?.delta?.content || "";
        if (token) res.write(token);
      }
      res.end();
      return;
    }

    // Fallback (tek seferde düz metin)
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [system, user],
    });
    const answer = completion.choices?.[0]?.message?.content?.trim() || "";
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(answer);
  } catch (err) {
    console.error("EXPLAIN ERROR:", err);
    try { res.status(500).send("Bir hata oluştu."); } catch {}
  }
}
