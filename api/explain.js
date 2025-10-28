// /api/explain.js
import 'dotenv/config';
import OpenAI from 'openai';

/**
 * HocAIm — Streaming Explain Endpoint
 * - text/plain stream
 * - meta-soru (terim/fonksiyon/kelime “nedir?”) algılama
 * - kısa/temiz cevap ilkesi (meta sorularda)
 * - temel bağlam + önceki mesajları kısaltarak gönderme
 *
 * İstek gövdesi (JSON):
 * {
 *   message: string,            // kullanıcının son mesajı (zorunlu)
 *   topic?: string,             // (opsiyonel) mevcut konu başlığı
 *   history?: Array<{role:"user"|"assistant", content:string}> // (opsiyonel)
 * }
 */

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// İstersen .env'de MODEL=gpt-4o-mini şeklinde tanımla; yoksa fallback kullanır
const MODEL = process.env.MODEL || 'gpt-4o-mini';

// CORS (gerekirse)
function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// --- Basit meta-soru algılama ---
// Kullanıcı “buradaki X nedir?”, “X ne demek?” gibi terim soruyorsa
// tüm konuyu anlatmak yerine sadece o terimi açıkla.
function detectMetaQuestion(raw) {
  const msg = (raw || '').toLowerCase();

  // Sık kalıplar
  const isMeta =
    /(nedir|ne demek|ne anlama gelir)/.test(msg) &&
    /(buradaki|şuradaki|bu |şu |\"\w+\"|\'\w+\')/.test(msg);

  // Çok spesifik buton: “buradaki text nedir”
  const targets = ['text', 'metin', 'function', 'fonksiyon', 'değişken', 'variable', 'const', 'let', 'class', 'tag', 'etiket', 'markdown'];
  const mentionsTarget = targets.some((t) => msg.includes(` ${t} `) || msg.endsWith(` ${t}`) || msg.startsWith(`${t} `));

  if (isMeta || mentionsTarget) {
    // Basitçe, tırnak içindeki veya son kelimeyi terim olarak ayıklamayı dene
    let term = null;
    const quote = raw.match(/[“”"']([^“”"']{1,40})[“”"']/);
    if (quote?.[1]) term = quote[1].trim();

    if (!term) {
      const pick = raw.match(/\b([A-Za-zğüşöçıİĞÜŞÖÇ0-9_\/\-\.\#\+]{2,32})\b(?=.*?(nedir|ne demek|anlama gelir))/i);
      if (pick?.[1]) term = pick[1].trim();
    }

    return {
      isMeta: true,
      term: term || null,
      // Varsayılan kısa açıklama (term bulunamazsa)
      fallback:
        "Bu soruda belirttiğin ifade bir **terim/etiket/metin yer tutucu** gibi kullanılıyor. Genelde *text* veya *metin* sözcüğü, yazılı içerik/karakter dizisini ifade eder; kodda/markdown’da gösterilen görünen yazıyı temsil eder.",
    };
  }
  return { isMeta: false, term: null, fallback: null };
}

// Geçmişi kısalt (maks 6-8 mesaj)
function compressHistory(history = [], limit = 6) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const sliced = history.slice(-limit);
  // Aşırı uzun içerikleri buda (token koruma)
  return sliced.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));
}

// Sistem prompt’u (kişilik + kurallar)
function systemPrompt(topic) {
  return [
    "Sen 'HocAIm'sin: sabırlı, motive edici, Türkçe konuşan bir yapay zekâ öğretmensin.",
    "Öğrencinin öğrenme tarzına (Görsel/İşitsel/Okuma-Yazma/Dokunsal) uygun, sade ve adım adım anlat.",
    "Gerekirse kısa maddeler, küçük örnekler ve mikro quiz öner.",
    "Gereksiz uzatma yapma; önce sorunun niyetini doğru anla.",
    "Eğer soru bir TERİM/SEMBOL/KOD parçasının anlamını soruyorsa (meta soru), SADECE o terimi açıkla; tüm konuyu baştan anlatma.",
    "LaTeX/markdown kullanabilirsin ama okunurluğu bozma.",
    topic ? `Güncel konu: ${topic}` : "Güncel konu belirtilmedi; kullanıcı mesajından çıkarım yap."
  ].join('\n- ');
}

// --- Ana handler ---
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST' });
    return;
  }

  try {
    const { message, topic, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message required' });
      return;
    }

    // 1) Meta-soru filtrele (erken dönüş)
    const meta = detectMetaQuestion(message);
    if (meta.isMeta) {
      const sys = systemPrompt(topic);
      const termText = meta.term
        ? `Kullanıcı özellikle şu terimi soruyor: "${meta.term}". Sadece bu terimi açıkla, 3-6 cümleyi geçme.`
        : "Kullanıcı bir terimin anlamını soruyor; terim net değil. Yine de kısa ve genel bir açıklama yap. 3-6 cümle.";

      const completion = await client.chat.completions.create({
        model: MODEL,
        stream: false,
        temperature: 0.3,
        messages: [
          { role: 'system', content: sys },
          ...compressHistory(history),
          { role: 'user', content: `${termText}\n\nKullanıcı mesajı: ${message}` },
        ],
      });

      const text = completion.choices?.[0]?.message?.content?.trim() || meta.fallback;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.status(200).send(text || meta.fallback);
      return;
    }

    // 2) Normal akış: streaming cevap
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt(topic) },
        ...compressHistory(history),
        { role: 'user', content: message },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) res.write(delta);
    }
    res.end();
  } catch (err) {
    console.error('explain.js error:', err);
    res.status(500).json({
      error: 'Explain endpoint failed',
      detail: err?.message || String(err),
    });
  }
}
