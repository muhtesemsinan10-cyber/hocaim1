import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Only POST" });

  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ ok:false, error:"prompt gerekli" });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const c = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    });

    res.json({ ok:true, reply: c?.choices?.[0]?.message?.content || "—" });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
}
