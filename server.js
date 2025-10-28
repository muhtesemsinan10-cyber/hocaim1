// server.js  (ESM)
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

/* ================== Path helpers (ESM) ================== */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ================== App setup ================== */
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* Static files: /public altında lesson.html vs. */
app.use(express.static(path.join(__dirname, "public")));

/* Sıkıcı 404 logunu engelle */
app.get("/favicon.ico", (_req, res) => res.status(204).end());

/* ================== OpenAI ================== */
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL  = process.env.MODEL || "gpt-4o-mini";

/* ================== Health check ================== */
app.get("/api/ping", (_req, res) => {
  res.json({ ok: true, msg: "Canım HocAIm API ayakta ✅" });
});

/* =========================================================
   (Opsiyonel) Basit kısa cevap endpoint'i
   body: { prompt: string }
========================================================= */
app.post("/api/ask", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "prompt gerekli" });

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      messages: [
        { role: "system", content: "Sen HocAIm adlı kişiselleştirilmiş bir AI öğretmensin. Kısa, anlaşılır, motive edici anlat." },
        { role: "user",   content: prompt }
      ]
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "Cevap üretilemedi.";
    res.json({ ok: true, reply: text });
  } catch (err) {
    console.error("OpenAI hata (/api/ask):", err?.message || err);
    res.status(500).json({ ok: false, error: "Sunucu hatası" });
  }
});

/* ================== Yardımcılar ================== */
// Meta soru (terim/etiket “nedir?”) algısı
function detectMetaQuestion(raw) {
  const msg = (raw || "").toLowerCase();
  const isMeta =
    /(nedir|ne demek|ne anlama gelir)/.test(msg) &&
    /(buradaki|şuradaki|bu |şu |\"\w+\"|\'\w+\')/.test(msg);

  const targets = [
    "text","metin","function","fonksiyon","değişken","variable",
    "const","let","class","tag","etiket","markdown"
  ];
  const mentionsTarget = targets.some(t =>
    msg.includes(` ${t} `) || msg.endsWith(` ${t}`) || msg.startsWith(`${t} `)
  );

  if (isMeta || mentionsTarget) {
    let term = null;
    const quote = raw.match(/[“”"']([^“”"']{1,40})[“”"']/);
    if (quote?.[1]) term = quote[1].trim();
    if (!term) {
      const pick = raw.match(/\b([A-Za-zğüşöçıİĞÜŞÖÇ0-9_\/\-\.\#\+]{2,32})\b(?=.*?(nedir|ne demek|ne anlama gelir))/i);
      if (pick?.[1]) term = pick[1].trim();
    }
    return { isMeta: true, term, fallback: "Bu ifade genelde görünen yazıyı/etiketi temsil eder." };
  }
  return { isMeta: false, term: null, fallback: null };
}

// Geçmişi kısalt (token koruması)
function compressHistory(history = [], limit = 6) {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history.slice(-limit).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 2000),
  }));
}

// Sistem prompt (kişilik + kurallar)
function systemPrompt(topic) {
  return [
    "Sen 'HocAIm'sin: sabırlı, motive edici, Türkçe konuşan bir yapay zekâ öğretmensin.",
    "Öğrencinin öğrenme tarzına (Görsel/İşitsel/Okuma-Yazma/Dokunsal) uygun, sade ve adım adım anlat.",
    "Gerekirse kısa maddeler, küçük örnekler ve mikro quiz öner.",
    "Gereksiz uzatma yapma; önce sorunun niyetini doğru anla.",
    "Eğer soru bir TERİM/SEMBOL/KOD parçasının anlamını soruyorsa (meta soru), SADECE o terimi açıkla; tüm konuyu baştan anlatma.",
    "LaTeX/markdown kullanabilirsin ama okunurluğu bozma.",
    topic ? `Güncel konu: ${topic}` : "Güncel konu belirtilmedi; kullanıcı mesajından çıkarım yap."
  ].join("\n- ");
}

/* =========================================================
   /api/explain — text/plain STREAM (Frontend: lesson.html)
   body: { message: string, topic?: string, history?: [{role,content}] }
========================================================= */
app.post("/api/explain", async (req, res) => {
  try {
    const { message, topic, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message required" });
    }

    // 1) Meta-soru kısa dönüş
    const meta = detectMetaQuestion(message);
    if (meta.isMeta) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        stream: false,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt(topic) },
          ...compressHistory(history),
          {
            role: "user",
            content:
              (meta.term
                ? `Kullanıcı özellikle şu terimi soruyor: "${meta.term}". Sadece bu terimi açıkla, 3-6 cümle.`
                : "Kullanıcı bir terimin anlamını soruyor; terim net değil. Kısa ve genel bir açıklama yap. 3-6 cümle.") +
              `\n\nKullanıcı mesajı: ${message}`
          },
        ],
      });
      const text = completion.choices?.[0]?.message?.content?.trim() || meta.fallback;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(text || meta.fallback);
    }

    // 2) Normal akış: streaming
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt(topic) },
        ...compressHistory(history),
        { role: "user", content: message },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta) res.write(delta);
    }
    res.end();
  } catch (err) {
    console.error("explain route error:", err);
    res.status(500).json({ error: "Explain endpoint failed", detail: err?.message || String(err) });
  }
});

/* ================== Start ================== */
app.listen(PORT, () => {
  console.log(`🟢 Sunucu ayakta: http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  OPENAI_API_KEY tanımlı değil. .env ekle!");
  }
});
