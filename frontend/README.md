# WhatsMonTrack Web

Next.js 16 (App Router, React 19) dashboard of [WhatsMonTrack](../README.md). Live: [bit.ly/WhatsMonTrack](https://bit.ly/WhatsMonTrack).

- Features and the user guide: [main README](../README.md#user-guide)
- Production deployment: [deploy/vps/README.md](../deploy/vps/README.md)

## Layout

```
src/
  app/                      layout (theme script, fonts) and the single page
  components/
    AuthWrapper.tsx         login, register, email OTP, password reset, session restore
    Dashboard.tsx           data loading, dialogs and the four views
    dashboard/views/        Ringkasan (overview), Transaksi (ledger), Chat (web chat with the bot),
                            Perlu ditinjau (review inbox)
    dashboard/              dialogs, navigation, WhatsApp modals, loading skeletons
    common/ui.tsx           shared UI primitives
    theme.tsx               light / dark / system theme
  lib/
    api.ts                  REST client (calls /api on the same origin)
    format.ts               rupiah, dates, category labels
```

The UI is in Indonesian; the API is reached at `/api` on the same origin (Nginx in development, Caddy in production).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server (used by `docker-compose.yml` behind Nginx) |
| `npm run build` | Production build (`output: standalone`) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

Running `npm run dev` on its own (without Docker) forwards `/api` to `http://localhost:3000` (see `next.config.ts`).

The production image is built from [`Dockerfile`](Dockerfile) by `deploy/vps/release.sh`.
