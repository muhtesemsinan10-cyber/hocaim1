import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Only POST" });
    return;
  }

  try {
    const { prompt, topic, question, style, level, context } = req.body || {};
    const finalPrompt = prompt || `
Konu: ${topic || '-'}
Soru: ${question || '-'}
Seviye: ${level || '-'}
Stil: ${style || '-'}
Bağlam: ${context || '-'}
Tek bir öğrenme stiline uygun, kısa, anlaşılır ve motive edici açıkla. Gerektiğinde 3 maddelik mini özet ver.
`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const c = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Sen 'Canım HocAIm'sın. Yalnızca verilen stile göre konuş, başka stil başlığı verme. Türkçe yanıt ver." },
        { role: "user", content: finalPrompt }
      ],
      temperature: 0.7
    });

    let text = c?.choices?.[0]?.message?.content || "—";
    // Stil başlığı gibi şeyleri temizle:
    text = text.replace(/^#+\s*(Görsel|İşitsel|Okuma[- ]Yazma|Kinestetik).*$/gim, "").replace(/\n{3,}/g, "\n\n").trim();

    res.status(200).json({ ok: true, html: text, provider: "openai" });
  } catch (e) {
    console.error("explain error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
}
