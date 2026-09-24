# Listera: prima versione (tutto gratuito)

Struttura:
- `public/index.html`: il pannello
- `functions/api/generate.js`: logica server (prompt, limite giornaliero, chiamata AI)
- `src/worker.js`: entrata del Worker Cloudflare
- `wrangler.jsonc`: configurazione (sito statico + archivio KV `LIMITS`)

## Installazione

1. Chiave AI gratuita: https://aistudio.google.com (crea una chiave, senza carta).
2. Carica il CONTENUTO di questa cartella su un repository GitHub (la radice deve mostrare `public`, `functions`, `src`, `wrangler.jsonc`).
3. Cloudflare: crea un archivio KV chiamato `listera-limits` e controlla che il suo ID coincida con quello in `wrangler.jsonc`.
4. Cloudflare > Workers & Pages > Create > collega il repository. Build command vuoto, Deploy command `npx wrangler deploy`.
5. A deploy finito: Settings > Variables and Secrets > aggiungi `GEMINI_API_KEY` (tipo Secret). Facoltative: `GEMINI_MODEL` (default `gemini-2.5-flash`), `DAILY_LIMIT` (default 5).
6. Rifai il deploy e apri l'indirizzo `*.workers.dev`.

Non scrivere mai la chiave nei file e non caricarla su GitHub.

## Test da fare subito

- 5 articoli di categorie diverse, con e senza dati compilati.
- Controlla che non inventi misure, materiali o funzionamento.
- Prova "Rigenera" e la lingua EN.
- Dopo 5 generazioni deve dire che sono finite.

## Limiti da conoscere

- Le quote del piano gratuito AI si vedono in AI Studio. Se le finisci il sito risponde "servizio occupato".
- Il piano gratuito di Google può usare i dati inviati per migliorare i suoi prodotti: scrivilo nella privacy policy.
- Il limite per IP è una protezione semplice: reti condivise condividono il conteggio.
