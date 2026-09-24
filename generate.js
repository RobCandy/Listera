const CAT = {
  abbigliamento: ['vintage', 'y2k', 'streetwear', 'oversize', 'denim', 'minimal', 'casual', 'elegante'],
  scarpe: ['sneakers', 'vintage', 'running', 'stivali', 'tacchi', 'comode', 'streetwear', 'unisex'],
  casa_decorazione: ['homedecor', 'decorazionecasa', 'idearegalo', 'handmade', 'boho', 'minimal', 'vintage', 'lucidecorative'],
  elettronica: ['usato', 'funzionante', 'portatile', 'ricaricabile', 'usb', 'wireless', 'gadget', 'tech'],
  beauty: ['makeup', 'skincare', 'beauty', 'toeletta', 'cosmetici', 'manicure', 'capelli', 'specchio'],
  giocattoli: ['giocattoli', 'giochi', 'bambini', 'collezione', 'vintage', 'educativo', 'regalo', 'lego'],
  libri: ['libri', 'romanzo', 'usato', 'collezione', 'fumetti', 'manga', 'scuola', 'regalo'],
  altro: [],
};

const PROMPT = `Sei l'assistente di Listera. Scrivi annunci per Vinted partendo da foto e dati dell'utente.
REGOLE
1. Non inventare. Usa solo i dati dei campi o ciò che è chiaramente visibile. Tutto il resto va tra [ ] nel testo e in "dati_mancanti".
2. Se non sei sicuro di cosa sia l'oggetto, non indovinare: scrivi la domanda in "domande_utente".
3. Se vedi più pezzi, chiedi se è un lotto. Se l'utente vende un lotto, scrivi un annuncio bundle (elenco pezzi, titolo da lotto, proposta di prezzo unico) e imposta bundle=true.
4. Marca e modello letti da etichetta o scatola: usali, ma aggiungi in dati_mancanti "marca/modello letti dalla foto, verifica".
5. Funzionamento, condizione, misure, materiale, tempi di spedizione: mai dedurli dalla foto. Se l'utente non li ha forniti restano [ ] e li chiedi.
6. Tono: prima persona, frasi corte, concreto. Niente emoji, elenchi da catalogo, aggettivi da vetrina (perfetto, elegante, incantevole, must have, impeccabile).
7. Ordine: cos'è, come è fatto o cosa fa, condizioni e difetti, misure, spedizione.
8. Se c'è un profilo di stile, imita lunghezza, tono e struttura degli esempi.
9. Lingua dell'annuncio: quella richiesta in "lingua"; se è "auto", quella in cui l'utente ha scritto i campi o il profilo di stile, altrimenti italiano.
10. Categoria: scegli una tra le chiavi della lista hashtag. Usa 5-8 hashtag da quella lista solo se pertinenti, più marca o tipo se noti. Non inventare tendenze.
11. consigli_foto: segnala sfondo affollato, luce, angolazioni mancanti (etichetta, difetti, retro, riferimento per le misure) e immagini che sembrano prese da cataloghi o non originali.
12. Se "rigenera" è true, riscrivi tutto con parole e struttura diverse dal titolo precedente, mantenendo gli stessi fatti.
13. Titolo massimo 60 caratteri, parole chiave per prime.
Rispondi SOLO con JSON: {"titolo":"","descrizione":"","hashtag":[],"categoria":"","dati_mancanti":[],"domande_utente":[],"consigli_foto":[],"bundle":false}
Lista hashtag per categoria: ${JSON.stringify(CAT)}`;

const J = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const cut = (v, n) => String(v ?? '').slice(0, n);
const arr = (v, n = 8) => (Array.isArray(v) ? v.map((x) => cut(x, 300)).filter(Boolean).slice(0, n) : []);

export async function onRequestPost({ request, env }) {
  let b;
  try {
    b = await request.json();
  } catch {
    return J({ error: 'bad_request' }, 400);
  }
  const imgs = (Array.isArray(b.images) ? b.images : [])
    .filter((x) => typeof x === 'string' && x.startsWith('data:image/jpeg;base64,') && x.length < 1500000)
    .slice(0, 4);
  const fields = {};
  for (const [k, v] of Object.entries(b.fields || {})) fields[cut(k, 30)] = cut(v, 500);
  if (!imgs.length && !fields.tipo) return J({ error: 'need_input' }, 400);
  if (!env.GEMINI_API_KEY) return J({ error: 'config' }, 500);

  const limit = Number(env.DAILY_LIMIT) || 5;
  let left = limit;
  if (env.LIMITS) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `rl:${ip}:${new Date().toISOString().slice(0, 10)}`;
    const used = Number((await env.LIMITS.get(key)) || 0);
    if (used >= limit) return J({ error: 'limit' }, 429);
    await env.LIMITS.put(key, String(used + 1), { expirationTtl: 90000 });
    left = limit - used - 1;
  } else if (env.ALLOW_NO_LIMIT !== '1') {
    return J({ error: 'config' }, 500);
  }

  const style = arr(b.style, 3).map((s) => cut(s, 2000));
  const userText = JSON.stringify({
    campi: fields,
    lingua: ['it', 'en', 'auto'].includes(b.lang) ? b.lang : 'auto',
    profilo_di_stile: style,
    rigenera: !!b.previous,
    titolo_precedente: cut(b.previous, 200),
  });
  const parts = [{ text: userText }].concat(
    imgs.map((d) => ({ inlineData: { mimeType: 'image/jpeg', data: d.split(',')[1] } }))
  );
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';

  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: b.previous ? 1 : 0.7 },
      }),
    });
  } catch {
    return J({ error: 'ai' }, 502);
  }
  if (res.status === 429) return J({ error: 'busy' }, 503);
  if (!res.ok) return J({ error: 'ai' }, 502);

  let r;
  try {
    const data = await res.json();
    const txt = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    r = JSON.parse(txt.replace(/^```json|```$/g, '').trim());
  } catch {
    return J({ error: 'ai' }, 502);
  }
  return J({
    titolo: cut(r.titolo, 80),
    descrizione: cut(r.descrizione, 3000),
    hashtag: arr(r.hashtag, 8).map((h) => (h.startsWith('#') ? h : '#' + h).replace(/\s+/g, '')),
    categoria: cut(r.categoria, 40),
    dati_mancanti: arr(r.dati_mancanti),
    domande_utente: arr(r.domande_utente),
    consigli_foto: arr(r.consigli_foto),
    bundle: !!r.bundle,
    left,
  });
}
