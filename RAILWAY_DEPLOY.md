# Railway Deployment — Environment Variables

Copy these into Railway → Project → Variables before deploying.

## Required

| Variable | Value |
|---|---|
| `GUARDIAN_API_KEY` | `7032c3bd-1fa6-4dc5-b63b-d5f8428812ab` |
| `NEWSAPI_KEY` | `c6902198c40045fc9573acda247d4a1a` |

## Optional

| Variable | Default | Notes |
|---|---|---|
| `NEWS_REFRESH_MINUTES` | `25` | How often the server fetches fresh news. 25 min = ~58 Guardian requests/day. |

## Notes

- **Guardian API** is the primary source — real-time, no delay, free.
- **NewsAPI** is the fallback — 24-hour delay on the developer (free) plan.
- Railway automatically sets `PORT` — the start command uses it via `next start -p ${PORT:-3000}`.

## Deploy steps

1. Push this repo to GitHub (already done at https://github.com/roypan21/epicfurystockwatch)
2. Railway → New Project → Deploy from GitHub → select `epicfurystockwatch`
3. Add the environment variables above
4. Railway builds via Nixpacks and deploys automatically
