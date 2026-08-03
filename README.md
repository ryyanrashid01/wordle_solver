<div align="center">
  <a href="https://ryyanrashid01.github.io/wordle_solver/">
    <img src="./public/icon.svg" alt="Wordle Solver" width="88" height="88">
  </a>

  <h1>Wordle Solver</h1>

  <p><strong>A smarter second screen for Wordle.</strong><br>Recreate your colors, shrink the search space, and make every guess count.</p>

  <p>
    <a href="https://ryyanrashid01.github.io/wordle_solver/"><img alt="Open the live solver" src="https://img.shields.io/badge/OPEN_LIVE_SOLVER-6aaa64?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
  </p>

  <p>
    <img alt="React 19" src="https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb">
    <img alt="Bun" src="https://img.shields.io/badge/Bun-f9f1e1?style=flat-square&logo=bun&logoColor=14151a">
    <img alt="Vite" src="https://img.shields.io/badge/Vite_8-646cff?style=flat-square&logo=vite&logoColor=white">
    <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS_4-0f172a?style=flat-square&logo=tailwindcss&logoColor=38bdf8">
    <img alt="8,888 ESDB words" src="https://img.shields.io/badge/ESDB_dictionary-8%2C888_words-c9a84e?style=flat-square">
    <img alt="Tests passing" src="https://img.shields.io/badge/tests-8_passing-6aaa64?style=flat-square">
  </p>
</div>

---

## A solver that feels like Wordle

Type the word you played, then click each tile to cycle through gray, yellow,
and green until the row matches your game. The next row previews a ranked guess
in a faded Wordle-style treatment; browse alternatives with the arrow controls
or open the complete searchable result list.

| | What you get |
| --- | --- |
| **Wordle-native input** | Type naturally, use the on-screen keyboard, and click tiles to reproduce feedback. |
| **Smarter suggestions** | Expected information gain leads the ranking, with letter coverage and word familiarity as supporting signals. |
| **A maintained offline dictionary** | 8,888 five-letter words generated from one pinned ESDB release, with no supplemental lists or runtime API. |
| **Fast, private processing** | Candidate filtering stays in your browser and expensive ranking runs in a Web Worker. |
| **Modern interface** | Responsive light and dark themes built with source-owned shadcn components, Radix primitives, Tailwind CSS, and Geist. |
| **Interactive scoring lab** | Explore feedback buckets, entropy, expected remaining words, and every weighted score component on the [live mathematics page](https://ryyanrashid01.github.io/wordle_solver/#scoring). |

## How it works

1. **Make a guess** in Wordle, then enter the same five letters here.
2. **Copy the result** by cycling each tile through absent, present, and correct.
3. **Apply the colors** to eliminate impossible answers and rerank the remaining words.
4. **Use the recommendation** or browse every valid alternative before repeating.

Feedback matching follows Wordle's duplicate-letter rules rather than treating
each character independently. Once the result set is small enough, every
remaining candidate receives an exact entropy evaluation.

## The word universe

The generated dataset has one pinned, reproducible source:

| Source | Words | Role |
| --- | ---: | --- |
| English Speller Database `rel-2026.02.25` | **8,888** | American, British, and variant spellings through ESDB size 80 |

ESDB commonness tiers help familiar guesses win close rankings without
overriding information gain. Capitalized proper nouns and abbreviations are
excluded. Historical project lists are not merged into the dataset, so every
word and every commonness tier has the same provenance.

Regenerate the checked-in dataset from the exact pinned upstream commit:

```sh
bun run words:update
```

The generator downloads ESDB, verifies its commit, builds the source database,
and deterministically produces `src/data/words.js`. See
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution and licensing.

## Run it locally

Requires [Bun](https://bun.sh/).

```sh
git clone https://github.com/ryyanrashid01/wordle_solver.git
cd wordle_solver
bun install
bun run dev
```

Then open the local URL printed by Vite.

### Quality checks

```sh
bun test
bun run build
```

### Production deployment

```sh
bun run deploy
```

The Vite build is configured for the `/wordle_solver/` GitHub Pages base path.

## Project layout

```text
src/App.jsx                Main interface and interaction state
src/components/ScoringGuide.jsx  Interactive algorithm and mathematics page
src/lib/solver.js          Wordle matching and ranking model
src/lib/rank.worker.js     Background ranking worker
src/lib/use-ranked-candidates.js Shared background-ranking hook
src/data/words.js          Generated word universe and commonness tiers
scripts/update-words.mjs   Reproducible ESDB import pipeline
src/components/ui/         Source-owned shadcn UI primitives
```

---

<div align="center">
  <p>Built for that <em>“one more guess”</em> feeling.</p>
  <p><a href="https://ryyanrashid01.github.io/wordle_solver/">Launch solver</a> · <a href="https://github.com/ryyanrashid01/wordle_solver/issues">Report an issue</a></p>
</div>

> Wordle Solver is an independent helper and is not affiliated with The New York Times.
