# Aperture Hours

A noncommercial daylight-window planner using live Open-Meteo forecasts and
transparent authored heuristics. The production design and evidence packet is
maintained by the `claude.design` production controller.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Generate `APERTURE_SERVER_SECRET` with at least 32 random bytes.
3. Run `pnpm install`, then `pnpm dev`.

The in-memory adapter is for deterministic local validation only. Production
saving requires the private Vercel Blob store token and the explicit save flag.
The launch cap is 20 saved plans per UTC day and 3 per browser per rolling hour.

## Data boundary

The site accepts only city-level location data and fixed planning controls. A
saved plan contains no name, email, exact address, upload, or free-form text.
Anyone holding a share link can read its contents. The backing Blob object is
private and is served only through the application route. Plans become
unavailable after 30 days and are removed by an authenticated daily cleanup.

Contact: [public GitHub Issues](https://github.com/gitjndmx/aperture-hours/issues).
An issue is public and requires a GitHub account; do not post personal data.
