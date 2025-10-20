// server.js  (ESM)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

// __dirname / __filename (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- App ---
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Statik: public/
app.use(express.static(path.join(__dirname, 'public')));
// Favicon 404'u sustur
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// OpenAI client
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------
   Sağlık kontrolü
------------------------------------------------------- */
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, msg: 'Canım HocAIm API ayakta ✅' });
});

/* -------------------------------------------------------
   Basit sohbet (lesson içi serbest kullanım)
   body: { prompt: string }
------------------------------------------------------- */
app.post('/api/ask', async (req, res) => {
  try {
    const { prompt } = req.body ?? {};
    if (!prompt) return res.status(400).json({ error: 'prompt gerekli' });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Sen HocAIm adlı kişiselleştirilmiş bir AI öğretmensin. Kısa, anlaşılır, motive edici anlat.' },
        { role: 'user',   content: prompt }
      ],
      temperature: 0.6
    });

    const text = completion?.choices?.[0]?.message?.content ?? 'Cevap üretilemedi.';
    res.json({ ok: true, reply: text });
  } catch (err) {
    console.error('OpenAI hata (/api/ask):', err?.message || err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası' });
  }
});

/* -------------------------------------------------------
   Stil-kilitli anlatım
   body: {
     prompt?: string,   // serbest istek (opsiyonel)
     topic?:  string,   // konu adı (opsiyonel)
     style?:  'V'|'A'|'R'|'K'|'auto', // öğrenme stili
     level?:  string,   // seviye (Lise/Üni vs)
     context?: string   // günün planı vb. kısa bağlam
   }
   Dönen: { ok, html, provider }
------------------------------------------------------- */
app.post('/api/explain', async (req, res) => {
  try {
    const { prompt, topic, style = 'auto', level, context } = req.body || {};

    const styleNameMap = {
      V: 'Görsel',
      A: 'İşitsel',
      R: 'Okuma-Yazma',
      K: 'Kinestetik',
      auto: 'Otomatik'
    };
    const styleName = styleNameMap[style] || 'Otomatik';

    // Modeli TEK stile kilitleyen net yönerge:
    const system = `
Sen HocAIm — öğrencinin seviyesine ve hedef öğrenme stiline göre anlatan bir AI öğretmensin.
Hedef stil: ${styleName}

Kurallar:
- SADECE ***${styleName}*** stilinde yanıt ver.
- ***Yanlış:*** "Görsel / İşitsel / Okuma-Yazma / Kinestetik" gibi BİRDEN ÇOK stile ayrı başlıklı bölümler yazmak.
- ***Doğru:*** Sadece hedef stile uygun tek anlatım üretmek.
- Kısa, anlaşılır, motive edici bir ton kullan; gerektiğinde maddeler/mini örnek ver.
- Seviye: ${level || 'Lise'}.
- Bağlam: ${context || '-'}.
`.trim();

    const user = (prompt && prompt.trim().length)
      ? `Konu: ${topic || '-'}\nSoru/İstek: ${prompt}`
      : `Konu: ${topic || '-'}\nBu konuyu ${styleName} stilde kısa ve anlaşılır anlat.`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user }
      ],
      temperature: 0.6
    });

    // Metni al
    let text = completion?.choices?.[0]?.message?.content || 'Cevap üretilemedi.';

    // Emniyet: Model inat edip "Görsel/İşitsel..." başlıkları açarsa sil.
    text = text
      .replace(/^#+\s*(Görsel|İşitsel|Okuma[- ]?Yazma|Kinestetik).*$/gmi, '')
      .replace(/\*\*(Görsel|İşitsel|Okuma[- ]?Yazma|Kinestetik)\*\*.*?\n/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    res.json({ ok: true, html: text, provider: 'openai' });
  } catch (err) {
    console.error('OpenAI hata (/api/explain):', err?.message || err);
    res.status(500).json({ ok: false, error: 'Sunucu hatası' });
  }
});

/* -------------------------------------------------------
   Start
------------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`🟢 Sunucu ayakta: http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY tanımlı değil. .env ekle!');
  }
});
