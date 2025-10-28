// --- Yardımcılar: meta- soru algılama, history kısaltma, sistem prompt
function detectMetaQuestion(raw) {
  const msg = (raw || "").toLowerCase();
  const isMeta =
    /(nedir|ne demek|ne anlama gelir)/.test(msg) &&
    /(buradaki|şuradaki|bu |şu |\"\w+\"|\'\w+\')/.test(msg);
  const targets = ["text","metin","function","fonksiyon","değişken","variable","const","let","class","tag","etiket","markdown"];
  const mentionsTarget = targets.some(t => msg.includes(` ${t} `) || msg.endsWith(` ${t}`) || msg.startsWith(`${t} `));
  if (isMeta || mentionsTarget) {
    let term = null;
    const quote = raw.match(/[“”"']([^“”"']{1,40})[“”"']/);
    if (quote?.[1]) term = quote[1].trim();
    if (!term) {
      const pick = raw.match(/\b([A-Za-zğüşöçıİĞÜŞÖÇ0-9_\/\-\.\#\+]{2,32})\b(?=.*?(nedir|ne demek|anlama gelir))/i);
      if (pick?.[1]) term = pick[1].trim();
    }
    return { isMeta: true, term, fallback: "Bu ifade genelde görünen yazıyı/etiketi temsil eder." };
  }
  return { isMeta:false, term:null, fallback:null };
}

function compressHistory(history = [], limit = 6) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const sliced = history.slice(-limit);
  return sliced.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 2000),
  }));
}

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

// ========== YENİ /api/explain (text/plain stream) ==========
app.post("/api/explain", async (req, res) => {
  try {
    const { message, topic, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message required" });
    }

    // Meta-soruysa kısa yanıtı tek seferde dön
    const meta = detectMetaQuestion(message);
    if (meta.isMeta) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        stream: false,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt(topic) },
          ...compressHistory(history),
          { role: "user", content: (meta.term
              ? `Kullanıcı özellikle şu terimi soruyor: "${meta.term}". Sadece bu terimi açıkla, 3-6 cümle.`
              : "Kullanıcı bir terimin anlamını soruyor; terim net değil. Kısa ve genel bir açıklama yap. 3-6 cümle.") + `\n\nKullanıcı mesajı: ${message}`
          },
        ],
      });
      const text = completion.choices?.[0]?.message?.content?.trim() || meta.fallback;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(text || meta.fallback);
    }

    // Normal akış: STREAM
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
