# Stormfront

An original low-poly, first-person battle royale with **40 distinct guns**, five rarity tiers, building, loot, a shrinking storm, and human-only dedicated-server Solo and Duos rooms. Optional offline practice modes are explicitly labeled.

## Play with friends

1. Open the game, choose Online Solo or Online Duos, enter a username and the multiplayer server URL.
2. Create a room. Share the game URL, server URL, and six-character room code.
3. Friends join the room. The host starts with at least two humans in Solo or four humans in Duos. Duos pairs players in join order; online matches never add bots.

Every online and offline practice match starts inside the flying battle bus cabin. Press **Space** to jump out, use **G** to deploy your glider, and steer with **WASD**. It automatically opens near the ground, and anyone still on the bus is dropped when its 18-second flight ends. The map shows the bus route, safe zone, reboot vans, and your team.

| Controls | Action |
|---|---|
| WASD / arrows, Shift | Move, sprint |
| Mouse, left / right click | Look, fire, aim down sights |
| Space, G | Jump / exit bus, toggle glider while dropping |
| E, 1 / 2, R | Loot a gun, swap weapon slots, reload |
| Q, F | Build cover, heal |
| M, hold H | Map, reboot a teammate |
| Escape | Pause controls (online matches keep running) |

In Duos, collect your eliminated teammate's cyan reboot card, go to a cyan van marked on the map, and hold **H** for six seconds without moving or firing. Taking damage interrupts rebooting. Only connected teammates can return; they respawn with a glider and starter weapons. You spectate your teammate while eliminated.

## Cosmetic shop

The eight original skins use **Storm Coins**, not Fortnite V-Bucks or real money. New profiles start with 200 coins. Completed matches lasting at least 30 seconds earn 20 coins (60 for winners), plus 10 per elimination. Prices and balances are checked by the server. Cosmetics do not alter combat stats.

Profiles are anonymous browser-held, server-signed tokens, not password-protected accounts. Keep `PROFILE_SECRET` stable across deployments. Clearing browser storage or changing the signing secret loses your profile. Room state is temporary and server restarts end active matches. Never use these coins for real-money transactions.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

Open `http://localhost:3000`. For local-network play, use this computer's LAN address and allow the chosen port through its firewall. The default port is 3000; `PORT` overrides it.

```sh
npm run check
npm test
npm run test:browser
```

The browser test requires Microsoft Edge on Windows, or set `BROWSER_PATH` to a Chromium-based browser executable. It runs actual WebGL and two WebSocket client connections against a temporary server.

## Public deployment

- **GitHub Pages:** the `gh-pages` branch contains only public client files. Use that branch and its root folder as the Pages source. After editing client files, republish them to `gh-pages`; the backend and tests stay on `main`.
- **Render:** create a Blueprint from this repository using `render.yaml`. It uses a free Node web service and generates a stable `PROFILE_SECRET`. Approve the deployment in your own Render account.
- Once deployed, use the Render service URL directly to play, or enter it as the server URL on the GitHub Pages game. To prefill it for everyone, set `serverUrl` in `config.js` to the public HTTPS Render URL and push the change.
- Free hosting can sleep when idle and take time to wake. Public multiplayer is unavailable until the server is deployed. This is invite-room multiplayer, not automatic matchmaking.
- Optional `ALLOWED_ORIGIN` limits WebSocket connections to one exact game origin. Leave it unset to allow both the Render-hosted game and GitHub Pages.

After committing client updates on `main`, run `npm run publish:pages` to publish the public files without exposing the server. This requires Git author configuration and push access.

All artwork, character models, weapon names, and cosmetics are original. This project is not Fortnite and is not affiliated with Epic Games.
