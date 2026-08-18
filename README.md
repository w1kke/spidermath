# Spider-Math 🕷️

A math quiz game for school children (grades 1–3). A question appears at the top,
three buildings show possible answers — tap the right one and the spider hero swings
up and lands on the roof. Tap the wrong one and the building collapses and you lose
a life (you have three). 10 questions per round, drawn from 100 exercises per grade.

Runs in any modern browser, on PC (mouse or keys 1/2/3) and on phones (touch).
No build step, no dependencies — plain HTML/CSS/JS.

## Play it

```bash
python3 -m http.server 8642
# then open http://localhost:8642
```

Or just double-click `index.html` (works offline; the comic font needs internet once).

To share the game as a single file (email, USB stick, school): send `spider-math.html` —
everything is bundled inside it, including all 300 exercises. Rebuild it after any
change with:

```bash
node tools/build-single-file.mjs
```

To play on a phone on the same Wi-Fi: start the server as above, find your
computer's IP (System Settings → Wi-Fi), and open `http://<that-ip>:8642` on the
phone. Or host the folder anywhere static (GitHub Pages, Netlify, …).

## The exercises

- `js/data/grade1.js` — 100× addition/subtraction up to 20
- `js/data/grade2.js` — 100× addition/subtraction up to 100 + easy times tables (2,3,4,5,10)
- `js/data/grade3.js` — 100× full times tables, division, bigger numbers

Each entry is `{ q: "3 + 4", a: 7, c: [6, 7, 8] }` — question, answer, and the three
numbers shown on the buildings. Edit them by hand, or regenerate fresh sets with:

```bash
node tools/generate-questions.mjs   # change SEED inside for different questions
```

The generator validates every answer and choice before writing.

## Code map

| File | What it does |
|------|--------------|
| `index.html` | Screens (start / game / end), HUD, script wiring |
| `css/style.css` | Comic-book UI styling |
| `js/game.js` | Game rules, swing/collapse state machine, input |
| `js/render.js` | Canvas drawing: city, buildings, hero, webs, particles |
| `js/questions.js` | Picks 10 random questions per round |
| `js/sound.js` | All sound effects, synthesized with WebAudio |
| `tools/smoke_test.py` | Automated play-through test (Playwright) |

Made by Robin & son.
