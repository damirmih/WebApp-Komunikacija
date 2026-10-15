# Komunikacija · plan do Nove godine

Dnevni plan vežbanja komunikacije (15. 10. – 31. 12. 2026): glas, jasnoća, small talk, pitch za InnovNation.
Radi kao web aplikacija na iPhone-u (Dodaj na početni ekran) i na Macu. Bez build koraka.

## Struktura

- `index.html`, `styles.css`, `app.js` – aplikacija (vanilla ES moduli, hash ruter)
- `store.js` – skladište: localStorage odmah, Supabase sinhronizacija kad je podešena
- `config.js` – Supabase URL i anon ključ (prazno = samo lokalno)
- `data/plan.json` – plan; generiše ga `../plan/build_plan.py` (ne menjaj ručno)
- `supabase/schema.sql` – tabela `entries` + RLS; pokrenuti jednom u Supabase SQL editoru

## Lokalno

```bash
python3 -m http.server 8765 --directory .
```

## Supabase

1. Supabase → SQL editor → nalepi `supabase/schema.sql` → Run.
2. Authentication → Providers → Email: uključeno (može bez potvrde emaila).
3. Upiši URL i anon ključ u `config.js`.
4. U aplikaciji: Podešavanja → Napravi nalog → Prijavi se (jednom po uređaju).

## Fotografije za hero (luk)

Luk na strani Danas trenutno crta CSS (mikrofon pod svetlom). Kad budu fotografije: `images/W0.jpg … W11.jpg` (4:5, ~900×1125),
pa u `app.js` u `viewToday` vratiti `<img src="images/${w.id}.jpg">` unutar `.arch`.
