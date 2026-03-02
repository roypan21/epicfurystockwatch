# Railway Deployment Guide

## Environment Variables

Set these in Railway → Project → Variables before deploying.
**Actual key values are stored locally in `RAILWAY_KEYS.local` (gitignored — never committed).**

| Variable | Where to get it |
|---|---|
| `GUARDIAN_API_KEY` | [open-platform.theguardian.com](https://open-platform.theguardian.com/access/) — free |
| `NEWSAPI_KEY` | [newsapi.org](https://newsapi.org) — free, 100 req/day |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) — free |
| `NEWS_REFRESH_MINUTES` | Optional — default `25` (Guardian is primary, NewsAPI is fallback) |

## Deploy Steps

1. Push this repo to GitHub (`git push` — already set up at `roypan21/epicfurystockwatch`)
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub** → select `epicfurystockwatch`
3. Add the environment variables from `RAILWAY_KEYS.local`
4. Railway auto-detects Next.js via Nixpacks — builds and deploys automatically

## Notes

- `PORT` is set automatically by Railway — the start command uses it via `next start -p ${PORT:-3000}`
- Guardian API is the **primary** news source (real-time). NewsAPI is the **fallback** (24h delay on free plan)
- Groq uses **Llama 4 Maverick** for AI stock analysis — ~2s latency, free tier is generous
- Stock + commodity prices come from **Yahoo Finance v8 API** — no key required
