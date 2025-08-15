# Track the Visitor

A single-page web app that theatrically locates a visitor by public IP on a Leaflet map and shows rich browser details in a table.

## Features

- Fetches public IP and approximate geolocation using public APIs (no key required)
- Smooth “fly-to” animation and pulsing marker on a Leaflet map
- Compact heads-up display to narrate the steps
- Detailed browser information table (UA, languages, screen, network, storage, etc.)
- Copy-all-as-JSON button
- Graceful fallback to device geolocation (with permission) if IP lookup fails

## Run locally

This is a static site. You can open `index.html` directly in a browser, but some browsers restrict `file://` fetches. Prefer a simple static HTTP server.

### Option 1: Python 3

```sh
python3 -m http.server 5173
```

Then open:

```
http://localhost:5173
```

Bind to a specific IP (e.g., 192.168.195.193) so other devices on your LAN can reach it:

```sh
python3 -m http.server 5173 --bind 192.168.195.193
```

Then open from another device on the same network:

```
http://192.168.195.193:5173
```

### Option 2: Node (serve)

```sh
npx serve -p 5173
```

Bind to a specific IP with `serve`:

```sh
npx serve -p 5173 -l 192.168.195.193
```

Alternative (http-server):

```sh
npx http-server -p 5173 -a 192.168.195.193
```

## Notes on accuracy and privacy

- IP-based geolocation is approximate (often city-level). It can be wrong, VPN-influenced, or unavailable.
- The app queries public endpoints from the client browser: ipapi.co, ipinfo.io, and ip-api.com. See their docs for quotas/acceptable use.
- No data is sent to a server you control unless you host your own proxy. Everything runs client-side by default.
- If device geolocation is used, the browser will prompt for permission first.

## Customization

- Styling: edit `assets/style.css`
- Behavior: edit `assets/script.js` (e.g., animation timing, which IP providers to use)
- Map tiles: swap the Leaflet tile layer URL for your preferred provider

## License

MIT