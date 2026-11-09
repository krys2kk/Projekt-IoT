# IoT Pomieszczenie — panel webowy

Panel systemu IoT do monitoringu i kontroli dostępu (React + TypeScript + Recharts). Wszystkie dane pochodzą z API backendu.
Efektem pracy jest statyczny build w `dist/`, który serwuje backend.

## Wdrożenie

Wgraj ten folder jako `frontend` obok `backend`. Backend domyślnie szuka panelu w `../frontend/dist`
(inne miejsce wskazuje zmienna `FRONTEND_DIST_PATH`). Katalog sprawdzany jest przy starcie backendu,
więc po pierwszym wgraniu trzeba go uruchomić ponownie.

Repozytorium ignoruje `dist/`, więc po `git clone` trzeba go zbudować (`npm install`, `npm run build`, wymaga Node.js 18+) albo
skopiować gotowy katalog na serwer. Panel używa względnych adresów, a fonty są w buildzie: działa pod dowolnym adresem i bez internetu.

## Praca nad panelem

```bash
npm install
npm run dev     # serwer deweloperski; /api idzie na VITE_BACKEND_URL (domyślnie http://localhost:8000)
npm run build   # sprawdzenie typów i build do dist/
```

## Jak panel korzysta z API

- **Polecenia:** body `{"payload": {...}}`. Backend odpowiada `sent` zaraz po publikacji w MQTT, więc potwierdzenie to pojawienie się
  oczekiwanego stanu w `last_state` (panel sprawdza przez 6 s). Właściwości, których urządzenia nie publikują (`effect`, `sensitivity`,
  `silent_mode`, `child_lock` itd.), są oznaczane jako „wysłane”.
- **Czas:** zakresy idą w formacie bazy (`…:SSZ`, bez milisekund), bo backend porównuje znaczniki jako tekst.
- **Zużycie energii:** `max − min` w okresie. Pole `daily_consumption` nie jest używane, bo przy braku przyrostu zawiera cały stan licznika.
- **Doby:** statystyki grupowane są wg UTC, zgodnie z backendem.
- **PIN:** `last_state.presented_value` modułu dostępu zawiera ostatnio wpisany PIN, więc panel go ukrywa.
