(function(){
  const KEY_LEVEL = 'ch.level';          // 'ilkokul' | 'ortaokul' | 'lise' | 'universite'
  const KEY_RESULTS = 'ch.testResults';  // ör: ['V','A','K','R','S', ...]
  const KEY_PROFILE = 'ch.profile';

  // Güvenli JSON erişimi
  const safeGet = (k, d=null)=>{ try{ const v = localStorage.getItem(k); return v? JSON.parse(v) : d; }catch{ return d } };
  const safeSet = (k, v)=> localStorage.setItem(k, JSON.stringify(v));

  // 1) Test ham sonuçlarını çek
  const level = localStorage.getItem(KEY_LEVEL)
             || localStorage.getItem('hocamLevel')
             || 'lise';
  const answers = safeGet(KEY_RESULTS, []);
  const total = answers.length;
  if(!total){ return; } // veri yoksa sessizce çık

  // 2) Stil sayımları (V/A/R/K + S)
  const mapName = { V:'Görsel', A:'İşitsel', R:'Okuma-Yazma', K:'Kinestetik', S:'İzleyerek' };
  const counts = { V:0, A:0, R:0, K:0, S:0 };
  answers.forEach(s=>{ if(counts[s]!=null) counts[s]++; });
  const order = Object.entries(counts).sort((a,b)=> b[1]-a[1]);
  const primary = order[0];        // ['V', 6] gibi
  const secondary = order[1] || ['-',0];
  const confidence = Math.round((primary[1] / Math.max(1,total))*100);

  // 3) Seviye bazlı ton ve öneriler (S için ipuçları eklendi)
  function toneByLevel(level){
    const tipsBy = (p)=>({
      V:['Konuları görsel özetle toparla.','Önemli yerleri renk kodla.'],
      A:['Konu anlatımını ses olarak kaydet.','Arkadaşına kısa anlatım yap.'],
      R:['5N1K ile yazılı özet çıkar.','Formül/anahtar kelime kartı hazırla.'],
      K:['Uygulamalı soru ve mini deney ekle.','25+5 pomodoro ile hareketli molalar.'],
      S:['Kısa konu videolarıyla giriş yap.','Önemli anı dondurup 3 madde not al.']
    })[p];

    switch(level){
      case 'ilkokul': return {
        title: 'Harika! Öğrenme arkadaşını buldun 🎈',
        vibe: 'sıcacık, basit ve oyunlu',
        bullets:(p,s)=>[
          `Senin beynin **${mapName[p]}** anlatılarda parlıyor.`,
          secondary[1]>0?`İkincil süper gücün **${mapName[s]}**.`: `Tek bir süper güç öne çıkıyor.`,
          'Kısa, renkli, örnekli anlatımlar seni uçurur.'
        ],
        tips: tipsBy
      };
      case 'ortaokul': return {
        title: 'Güçlü yanını keşfettin 🚀',
        vibe: 'samimi ve net',
        bullets:(p,s)=>[
          `Baskın stilin: **${mapName[p]}** (%${confidence}).`,
          secondary[1]>0?`Destek stilin: **${mapName[s]}**.`:'Tek bir stil belirgin görünüyor.',
          'Düzenli tekrar + doğru format = hızlı ilerleme.'
        ],
        tips: tipsBy
      };
      case 'lise': return {
        title: 'Stratejik öğrenme profilin hazır 🧭',
        vibe: 'motive ve hedef odaklı',
        bullets:(p,s)=>[
          `Öne çıkan stil: **${mapName[p]}** — güven: %${confidence}.`,
          secondary[1]>0?`İkincil stil: **${mapName[s]}**.`:'Yoğun odak tek stilde.',
          'Deneme-analiz-düzen döngüsüyle net ilerleme planı çıkaracağız.'
        ],
        tips: tipsBy
      };
      default: return {
        title: 'Kişisel öğrenme raporun ✍️',
        vibe: 'profesyonel ve öz-disiplin odaklı',
        bullets:(p,s)=>[
          `Dominant stil: **${mapName[p]}** (n=${primary[1]}/${total}, %${confidence}).`,
          secondary[1]>0?`İkincil stil: **${mapName[s]}** (n=${secondary[1]}).`:'İkincil stil belirgin değil.',
          'Hedef: verim maksimize, bilişsel yük minimize.'
        ],
        tips: tipsBy
      };
    }
  }

  const tone = toneByLevel(level);

  // 4) Sonuç verisi
  const result = {
    level,
    total,
    counts,
    primary:{ code: primary[0], name: mapName[primary[0]], score: primary[1] },
    secondary:{ code: secondary[0], name: mapName[secondary[0]], score: secondary[1] },
    confidence,
    generatedAt: new Date().toISOString()
  };

  // Kalıcı profil
  safeSet(KEY_PROFILE, result);

  // 5) UI’ya bas (tercihen #result-root; yoksa main)
  const root = document.getElementById('result-root')
           || document.getElementById('result')
           || document.querySelector('.result')
           || document.querySelector('main');
  if(!root) return;

  const cssCard = 'background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px;';
  const el = document.createElement('section');
  el.style.cssText = 'max-width:900px;margin:18px auto 8px;padding:0 12px;';
  el.innerHTML = `
    <div style="${cssCard}">
      <h2 style="margin:0 0 8px">${tone.title}</h2>
      <p style="color:#475569;margin:0 0 16px">Ton: ${tone.vibe} • Seviye: <strong>${level}</strong></p>

      <div style="display:grid;gap:12px;grid-template-columns:repeat(3,1fr);@media(max-width:820px){grid-template-columns:1fr}">
        <article style="${cssCard}">
          <h3 style="margin:0 0 8px">Özet</h3>
          <ul style="margin:0;padding-left:18px">
            ${tone.bullets(result.primary.code, result.secondary.code).map(li=>`<li>${li}</li>`).join('')}
          </ul>
        </article>

        <article style="${cssCard}">
          <h3 style="margin:0 0 8px">Skor</h3>
          <p style="margin:.3rem 0">Toplam soru: <strong>${total}</strong></p>
          <p style="margin:.2rem 0">Baskın: <strong>${result.primary.name}</strong> (${result.primary.score})</p>
          <p style="margin:.2rem 0">İkincil: <strong>${result.secondary.name}</strong> (${result.secondary.score})</p>
          <div style="height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin-top:6px">
            <div style="height:100%;width:${confidence}%;background:#16a34a"></div>
          </div>
          <small style="color:#64748b">Güven: %${confidence}</small>
        </article>

        <article style="${cssCard}">
          <h3 style="margin:0 0 8px">Çalışma Tüyoları</h3>
          <ul style="margin:0;padding-left:18px">
            ${tone.tips(result.primary.code).map(t=>`<li>${t}</li>`).join('')}
          </ul>
        </article>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <a style="all:unset;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer"
           href="index.html?plan=starter&seviye=${encodeURIComponent(level)}">Hadi Başlayalım</a>
        <a style="all:unset;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;border:2px dashed #94a3b8;color:#475569;cursor:pointer"
           href="test.html#level">Seviyeyi Değiştir</a>
      </div>
    </div>
  `;
  root.appendChild(el);
})();
// rozet ve mini istatistikler
document.getElementById('chipLevel').textContent = 'Seviye: ' + levelText;
document.getElementById('chipPrimary').textContent = profile.primary?.name || '-';
document.getElementById('chipSecondary').textContent = profile.secondary?.name || '-';
document.getElementById('statTotal').textContent = profile.total ?? '-';
document.getElementById('statConf').textContent = (profile.confidence ?? 0) + '%';
