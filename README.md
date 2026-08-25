# Bonfire

A cozy, minimal virtual hangout built around a digital campfire. The fire is
the interface: it grows, brightens and gets louder as more people sit around
it, and shrinks back down when they leave.

**Live demo → https://lslaoang.github.io/bonfire/**

Click *+ Add user* to watch the fire respond.

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
- **Ambient beds** — crackling fire, wind and crickets, independently
  toggleable.
- **Fading chat** — messages drift up, blur and dissolve like smoke. Nothing
  is persisted and late joiners see nothing; that's the product, not a
  limitation.
- **Voice toggle** — real `getUserMedia`, drives a ring around your silhouette
  from an analyser node. Mic audio is never routed back to output.
- **Auto-hiding UI** — chrome fades after 3s idle, and won't hide mid-sentence.

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

`MockTransport` implements it with fake users. A `SocketTransport` sketch sits
directly beside it in `index.html`. Replace `const net = MockTransport()` and
nothing else in the app changes.

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

## Debugging

`window.bonfire` exposes `net`, `audio`, `users()` and `intensity()`.

## Licence

MIT for the source, see `LICENSE`. Embedded audio as noted above.
