# Bonfire

A cozy, minimal virtual hangout built around a digital campfire. The fire is
the interface: it grows, brightens and gets louder as more people sit around
it, and shrinks back down when they leave.

**Live demo → https://lslaoang.github.io/bonfire/**

**It is live and shared.** Open it and you are in the same circle as everyone
else who has it open — real presence, real messages, one fire that grows with
the crowd. Nothing is simulated and nothing is padded.

The relay runs on a free tier and sleeps when the fire goes out, so the first
person to arrive after a quiet spell waits while it wakes. The page says
*finding the others…* rather than pretending the clearing is empty.

---

## The idea

Presence is the only signal that matters. Everything else — flame height,
ember count, the size of the light pool on the ground, how brightly each
silhouette is rim-lit, how loud and how bright the fire sounds — is derived
from one number:

```
I = 0.22 + 0.78 · (1 − e^(−n/5.2))
```

`n` is the number of people connected. The curve saturates on purpose: twenty
people should feel bigger than five, but not four times bigger. `I` eases
toward its target rather than snapping, so a join reads as the fire *catching*
rather than a jump cut.

To add a feature, hang it off `I`. Don't add another counter.

## Features

- **Dynamic fire** — canvas particle system; spawn rates, scale, glow radius
  and audio all scale with occupancy.
- **No signup** — type a nickname, sit down.
- **Real occupancy only** — the roster reflects who is actually connected;
  nothing is padded out with fake participants.
- **Shared presence** — tabs bind to each other out of the box; add the relay
  and it binds across machines.
- **Ambient beds** — crackling fire, wind, crickets and ocean surf,
  independently toggleable. All synthesised; the only audio file is the
  optional campfire recording.
- **Fading chat** — messages hold for ~9s, then drift up, blur and dissolve
  like smoke, gone by 12.5s. Tune `SAY_LIFE` and `SAY_FADE` in `index.html`.
  Nothing is persisted and late joiners see nothing; that's the product, not
  a limitation.
- **Push-to-talk voice** — real peer-to-peer audio over WebRTC. Hold **Space**
  (or the *Hold to talk* pad) to open your mic; it is closed the rest of the
  time. Each person's ring pulses with what you are actually hearing.
- **Private circles** — open one with a shared key and it is reachable only
  by people who know that key.
- **Auto-hiding UI** — chrome fades after 3s idle, and won't hide mid-sentence.

## Connecting people

By default the circle binds **every tab and window of one browser**. Two tabs,
two people, real messages between them. Nothing to install.

To bind people across machines, run the relay in `server/`:

```bash
cd server && npm install && npm start     # listens on :8080
```

Then point the client at it — in `index.html`:

```js
const ROOM_SERVER = "ws://localhost:8080";     // wss:// once deployed
```

The deployed relay for this site lives at `wss://bonfire-relay.onrender.com`.

The relay is ~100 lines of Node and `ws`. It owns the roster and broadcasts it
whole and persists nothing.

Departure is handled twice over, because it has to be. A proxy in front of the
relay will not always forward a client's close frame promptly — measured at
10.2s against this deployment, with the ping sweep putting the worst case at
30s, during which the departed are still sitting at the fire. So the page
sends an explicit `bye` on `pagehide` and the relay acts on it at once
(measured 0.19s), and the 10s ping sweep is left as the safety net for
clients that crash without saying anything. Leaving is idempotent, so the
two paths cannot double-announce. A restart empties every circle, which is roughly what
happens when everyone walks away from a real fire.

`render.yaml` in the repo root deploys it to Render's free tier as-is. Any
host that supports WebSockets works — the relay is plain Node with one
dependency. Note that a page served over `https://` can only connect to a
`wss://` relay, not `ws://`.

### Voice

Voice is a **WebRTC mesh**. The relay routes the signalling — offers, answers
and ICE candidates, opaque to it — and then audio flows directly between
browsers and never touches the server.

A mesh is n(n-1)/2 connections, so it is the right shape for a small circle
and the wrong one for a crowd. Past roughly six simultaneous speakers the
per-person uplink is the reason to put an SFU (LiveKit, mediasoup) in the
middle instead. Presence and chat would not change: only `Voice` would.

Connections are reconciled against the roster on every presence update, so
joining, leaving and muting are all one code path. Of any two peers the lower
id places the call, so both sides never offer at once.

Voice is **push-to-talk**: joining voice establishes the connections but
leaves your outgoing track disabled. Holding Space — or the *Hold to talk*
pad, which is the only route on a phone — enables it. Gating the track rather
than the connection keeps the peer link warm, so the first syllable is not
clipped. The mic is force-closed on blur, on tab hide, and whenever the caret
is in a text field, because a live microphone nobody realises is open is the
worst way this can fail. That is also why joining does **not** focus the chat
box: a focused field would swallow the spacebar. Press `/` to type.

**Known limit:** only public STUN servers are configured, no TURN. On most
home and office networks that is enough, but symmetric NAT and strict
corporate firewalls will fail to connect, and there is no free TURN worth
relying on. Adding one is a config change in `ICE_SERVERS`.

### Rooms and private circles

`?room=porch` is a different, unlisted fire. Anyone who knows the name can
walk up to it.

A **private circle** is stronger. Enter a shared key on the join screen and
the key is stretched with PBKDF2 (150k iterations, SHA-256), then the digest
is split: the first 64 bits name the room, the remaining 192 prove you know
the key. The relay only ever sees those two halves, never the key itself, and
an empty circle forgets its key entirely.

Two properties worth understanding:

- **A wrong key is not rejected — it opens a different circle.** Because the
  room id is derived from the key, a mistyped key lands you somewhere else
  entirely, which is indistinguishable from an empty circle. That is
  deliberate: it gives an attacker no oracle to test guesses against. It is
  also confusing if you simply typed it wrong, so the page says something
  when a private circle stays empty.
- **The stored proof still matters.** It stops anyone who learns a room id
  some other way — a log, a proxy, a screenshot — from walking in without
  the key.

Keys are only as strong as the passphrase. PBKDF2 makes guessing expensive
but a short or common key is still guessable offline by anyone holding the
room id. Use a few unrelated words.

Rooms are created on demand and disappear when the last person leaves.

## Branches

| Branch | What it is |
|---|---|
| `main` | The shipped build. Real occupants only, and deployed to Pages. |
| `develop` | `main` plus a simulated crowd: *+ Add user* / *− Remove* controls, for exercising how the fire scales without opening a dozen tabs. |

The crowd simulator lives only on `develop` on purpose. A public demo that
manufactures people is a demo that misrepresents its own occupancy.

## Running it

No build step, no dependencies.

```bash
python3 -m http.server 8777
```

Then open <http://localhost:8777>. Opening `index.html` straight off disk also
works.

## Architecture

This is a **frontend prototype**. All remote state enters through one
interface, so there is exactly one place to swap in a real backend:

```js
transport.join(nick)       // announce yourself
transport.say(text)        // broadcast a chat line
transport.setVoice(bool)   // announce mic state
transport.on(evt, fn)      // 'presence' | 'message' | 'voice'
```

Three implementations ship, and `createTransport()` picks one at startup.
Nothing below the transport section knows or cares which is in use.

| Implementation | Binds together | Needs |
|---|---|---|
| `SocketTransport` | everyone connected to the relay | `ROOM_SERVER` set, relay deployed |
| `ChannelTransport` | every tab and window of one browser | nothing — this is the default |
| `LocalTransport` | you, alone | fallback for no `BroadcastChannel` |

`ChannelTransport` has no server and therefore no authority, so presence is
gossiped: announce yourself on join, answer anyone else who announces, and
heartbeat continuously so a tab that crashes without saying goodbye ages out
of everyone's roster instead of haunting it.

For a real deployment:

| Layer | Recommendation | Why |
|---|---|---|
| Presence + chat | WebSocket (`ws`, or Phoenix Channels) | Small ordered server-authoritative messages. Not a WebRTC problem. |
| Voice | WebRTC via an SFU (LiveKit, mediasoup) | Mesh P2P dies past ~5 peers. An SFU is one uplink per user and gives you speaking detection for free. |
| State | In-memory per room; Redis pub/sub only past one node | A room is ephemeral. Nothing here deserves a database. |
| Auth | Signed nickname token | The server assigns the id. The nickname is a display string, never a key. |

The room roster is broadcast whole on every change — it's ≤50 entries and
diffing is premature. The client renders what it's told and never decides who
is present.

## Audio

Everything is synthesised in Web Audio by default — no asset files. Crackle is
band-passed noise bursts, wind is brown noise through a sweeping low-pass,
crickets are chirp trains from a resonant square.

An optional recorded fire bed can replace the synthesised crackle. Set
`FIRE_BED_URL`, or use the helper:

```bash
./embed-fire.py              # lists audio files it finds nearby
./embed-fire.py fire.mp3     # inline as a data: URI
./embed-fire.py fire.mp3 --link   # link instead (needs http://, not file://)
./embed-fire.py --clear      # back to pure synthesis
```

Inlining matters for local use: `fetch()` on a `file://` sibling is
CORS-blocked, but `fetch()` on a `data:` URI is not.

The loader measures the file's own envelope to pick loop points, because field
recordings almost always open and close with a fade — looping across one makes
the fire dip to silence on every pass. The envelope is median-smoothed first,
since an isolated crackle inside a fade-out will otherwise anchor the loop to
that one pop. On this recording that took the seam mismatch from 13.7 dB to
0.8 dB. If the file fails to load, decode or 404s, the synthesis simply stays
on and the fire is never silent.

**Credit:** the campfire bed embedded in `index.html` is *"Campfire Crackling |
Fireplace Sound"* by **SoundsForYou**, via Pixabay, used under the
[Pixabay Content License](https://pixabay.com/service/license-summary/).
Attribution is not required by that licence; it's here because it's decent.
The raw file is deliberately **not** committed — see `.gitignore`.

## Icons

The tab icon and the iOS home-screen icon are both inlined into `index.html`
— an SVG data URI for the favicon, a 180x180 PNG for `apple-touch-icon`. A
`favicon.ico` sibling would 404 when the page is opened straight off disk,
and the single-file property is worth more here than the few kilobytes.

The home-screen icon is deliberately square with no rounded corners: iOS
applies its own mask, and a pre-rounded icon ends up double-rounded with dark
wedges in the corners.

## Debugging

`window.bonfire` exposes `net`, `audio`, `voice`, `users()` and `intensity()`.

To exercise voice without a microphone, stub `getUserMedia` with a synthetic
stream from `AudioContext.createMediaStreamDestination()` — it is a real
`MediaStream`, so the whole WebRTC path runs for real.

## Licence

MIT for the source, see `LICENSE`. Embedded audio as noted above.
