# How the Wordle Solver Scores a Guess

This document explains the scoring model used by this project, from raw Wordle
feedback to the `70–100` **smart score** shown in the interface. It includes a
complete run with `PLANT` as the hidden answer using the current 10,982-word
dataset and the exact implementation in `src/lib/solver.js`.

The most important idea is simple:

> A strong guess is not merely a likely answer. It is a question that divides
> the remaining answers into many useful groups.

The solver therefore combines information theory with a smaller preference for
useful letters and familiar words.

## Two different kinds of “score”

It helps to distinguish two concepts that are both called scoring:

1. **Wordle feedback scoring** determines whether each tile is gray, yellow, or
   green for a particular guess and answer.
2. **Guess ranking** estimates how valuable a word would be as the next guess.

The first produces a five-tile pattern. The second produces entropy, an internal
ranking value, and finally the displayed smart score.

## The complete pipeline

```text
previous guesses and colors
          │
          ▼
remove every incompatible candidate
          │
          ▼
measure positional frequency and unique-letter coverage
          │
          ▼
add a modest word-commonness preference
          │
          ▼
shortlist promising guesses when the candidate set is large
          │
          ▼
simulate each shortlisted guess against every possible answer
          │
          ▼
calculate expected information in bits
          │
          ▼
combine information, letter quality, and commonness
          │
          ▼
sort and rescale the result to a friendly 70–100 display score
```

## 1. Reproducing Wordle feedback exactly

The solver represents tile states as:

| State | Numeric pattern value |
| --- | ---: |
| Gray / absent | `0` |
| Yellow / present | `1` |
| Green / correct | `2` |

For example:

```text
gray · yellow · yellow · gray · gray
  0       1        1       0      0
```

becomes the pattern key:

```text
01100
```

### Why duplicate letters require two passes

Wordle cannot score each tile independently. Consider:

```text
Answer: A P P L E
Guess:  A L L E Y
```

The correct process is:

1. Mark exact matches first. The initial `A` is green.
2. Count only the unmatched answer letters: two `P`s, one `L`, and one `E`.
3. Walk through the remaining guess letters from left to right.
4. The first guessed `L` is yellow and consumes the answer's only remaining
   `L`.
5. The second guessed `L` must be gray because no unmatched `L` remains.
6. The guessed `E` is yellow, and `Y` is gray.

The final pattern is:

```text
A L L E Y
🟩 🟨 ⬛ 🟨 ⬛
2  1  0  1  0
```

The implementation follows this exact two-pass process. That prevents a common
solver bug where duplicate letters are awarded more yellow tiles than the answer
actually contains.

## 2. Filtering the candidate set

Let the current candidate set be `C`. For every candidate answer `a` and every
recorded guess `g`, the solver calculates:

```text
pattern(a, g)
```

The candidate survives only if that calculated pattern exactly equals the
colors entered by the player:

```text
keep a if pattern(a, g) = observedPattern(g)
```

This is stronger and safer than maintaining separate lists of:

- letters that must appear,
- letters that cannot appear,
- positions that are allowed, and
- positions that are forbidden.

Those individual rules become surprisingly complicated around repeated
letters. Replaying the complete Wordle pattern handles all of them at once.

## 3. Measuring letter quality

Before doing expensive entropy calculations, the solver builds a frequency
model from the candidates that remain.

Let:

- `N` be the number of remaining candidates.
- `P(i, l)` be the number of candidates containing letter `l` in position `i`.
- `U(l)` be the number of candidates containing letter `l` at least once.

`U(l)` counts a letter only once per candidate. A word containing two `E`s does
not make `E` look twice as useful for broad coverage.

For a potential guess `w`, the positional contribution is:

```text
positionValue(w) = Σ P(i, w[i])
```

The unique-letter coverage contribution is:

```text
coverageValue(w) = Σ U(l), for each unique letter l in w
```

The duplicate count is:

```text
duplicates(w) = 5 - numberOfUniqueLetters(w)
```

The raw frequency score is then:

```text
frequency(w) =
    positionValue(w) / (5N)
  + coverageValue(w) / (5N)
  - 0.035 × duplicates(w)
```

This rewards two slightly different things:

- A letter appearing in a productive position.
- A letter appearing anywhere in many possible answers.

The duplicate penalty reflects the fact that an early exploratory guess usually
learns more by testing five distinct letters. It is a preference, not an
absolute rule: a repeated-letter word can still win when the remaining answers
make that repetition valuable.

### Normalizing frequency

Raw frequency values depend on the current candidate set, so they are converted
to a `0–1` range:

```text
normalizedFrequency(w) =
  (frequency(w) - minimumFrequency)
  / (maximumFrequency - minimumFrequency)
```

The best frequency value becomes `1`; the worst becomes `0`.

## 4. Representing word commonness

The dictionary generator records the earliest English Speller Database tier in
which each word appears. Lower tiers contain more common vocabulary. The solver
maps those tiers onto this scale:

| ESDB tier | Normalized commonness |
| ---: | ---: |
| `≤ 35` | `1.00` |
| `≤ 40` | `0.92` |
| `≤ 50` | `0.78` |
| `≤ 60` | `0.62` |
| `≤ 65` | `0.50` |
| `≤ 70` | `0.35` |
| `≤ 80` | `0.15` |
| Extended legacy word | `0.02` |

This does not claim that a tier-35 word is the answer with 100% probability.
It is a small quality signal that stops obscure dictionary entries from winning
close contests against equally informative everyday words.

## 5. The inexpensive shortlist heuristic

The complete initial dictionary contains 10,982 words. Calculating every guess
against every possible answer would require roughly:

```text
10,982 × 10,982 ≈ 120.6 million guess-answer comparisons
```

Instead, the solver first calculates:

```text
heuristic(w) =
    0.78 × normalizedFrequency(w)
  + 0.22 × normalizedCommonness(w)
```

When more than 420 candidates remain, the strongest 200 heuristic candidates
receive full entropy evaluation. When 420 or fewer remain, every candidate is
evaluated exactly.

The initial shortlist is a performance compromise. It reduces the expensive
work dramatically while still putting high-coverage, familiar words into the
entropy stage. The calculation runs in a Web Worker so it does not freeze the
interface.

## 6. Measuring information with entropy

For a guess `g`, the solver pretends that every remaining candidate is the true
answer. Each answer produces one of Wordle's possible feedback patterns.

For example, a guess may divide 100 answers into buckets of:

```text
40, 25, 20, 10, 5
```

Each bucket represents answers that would return the same colors. After seeing
those colors, the player would know that the answer lies inside the matching
bucket.

For bucket `j`:

```text
p(j) = bucketSize(j) / N
```

The entropy of the guess is:

```text
H(g) = -Σ p(j) × log₂(p(j))
```

For the example buckets:

```text
H ≈ 2.04 bits
```

### Interpreting bits

A rough interpretation is:

| Information | Idealized effect |
| ---: | --- |
| `0 bits` | No useful split |
| `1 bit` | About two equally useful groups |
| `2 bits` | About four equally useful groups |
| `3 bits` | About eight equally useful groups |
| `4 bits` | About sixteen equally useful groups |

Entropy rewards both the number of patterns and how evenly answers are spread
across them. Ten patterns are less useful when 95% of answers land in a single
pattern than when the ten buckets have similar sizes.

Entropy is an expected value. It measures how much the guess should teach us
*before* we know which colors Wordle will return. A particular play can still be
luckier or less lucky than that average.

### Normalizing entropy

The theoretical uncertainty among `N` equally plausible candidates is:

```text
maximumEntropy = log₂(N)
```

The solver therefore uses:

```text
normalizedEntropy(g) = H(g) / log₂(N)
```

This produces a value that can be combined with the other normalized signals.

## 7. Combining the signals

For a fully evaluated candidate, the internal raw score is:

```text
rawScore(g) =
    0.82 × normalizedEntropy(g)
  + 0.06 × normalizedFrequency(g)
  + 0.12 × normalizedCommonness(g)
```

The weights mean:

- **82% information gain:** how effectively the guess separates answers.
- **6% letter quality:** a small preference for broadly productive letters.
- **12% commonness:** a modest guard against obscure recommendations.

Information gain is intentionally dominant.

Words outside the large-set entropy shortlist receive:

```text
rawScore(g) = 0.35 × heuristic(g)
```

This keeps them searchable and ranked without pretending that their entropy was
calculated. Once the candidate set reaches 420 words, every surviving word gets
the complete calculation.

## 8. Creating the displayed smart score

Raw scores are useful internally but not especially friendly to read. After
sorting, the solver maps the current best and worst raw values onto `100` and
`70`:

```text
smartScore(g) = 70 + 30 ×
  (rawScore(g) - worstRawScore)
  / (bestRawScore - worstRawScore)
```

The result is rounded to one decimal place.

Consequences:

- The best recommendation in the current state displays `100`.
- The lowest-ranked word displays `70`.
- A score of `95` does **not** mean a 95% chance of being correct.
- Scores from different rounds are not directly comparable because every round
  has different best and worst raw values.
- The separately displayed information bits are the more mathematically stable
  measurement.

## Complete worked example: hidden answer `PLANT`

The following numbers come from running the production algorithm against the
current generated dataset. They are not illustrative placeholders.

### Round 1: no clues yet

The solver begins with:

```text
N = 10,982 candidates
```

The first recommendations are:

| Rank | Guess | Smart score | Entropy | ESDB tier |
| ---: | --- | ---: | ---: | ---: |
| 1 | `RATES` | `100.0` | `6.104071 bits` | 35 |
| 2 | `TALES` | `99.9` | `6.071633 bits` | 35 |
| 3 | `LANES` | `99.7` | `6.024800 bits` | 35 |
| 4 | `SANER` | `99.7` | `6.048095 bits` | 35 |
| 5 | `CARES` | `99.6` | `6.005968 bits` | 35 |

Notice that entropy alone is not the complete ordering. `SANER` has slightly
more entropy than `LANES`, but the frequency contribution makes `LANES` narrowly
stronger in the combined score.

### Calculating `RATES` in detail

For `RATES`, the frequency model produces:

```text
positionValue = 7,976
coverageValue = 20,116
duplicateCount = 0
N = 10,982
```

Therefore:

```text
frequency(RATES)
  = 7,976 / (5 × 10,982)
  + 20,116 / (5 × 10,982)
  - 0.035 × 0

  = 0.51160080
```

Across the initial dataset:

```text
minimumFrequency = -0.02364870
maximumFrequency =  0.52376616
```

So:

```text
normalizedFrequency(RATES)
  = (0.51160080 - (-0.02364870))
    / (0.52376616 - (-0.02364870))

  = 0.97777671
```

`RATES` is an ESDB tier-35 word:

```text
normalizedCommonness(RATES) = 1.0
```

Its shortlist heuristic is:

```text
heuristic(RATES)
  = 0.78 × 0.97777671 + 0.22 × 1.0
  = 0.98266583
```

When simulated against all 10,982 candidate answers, `RATES` creates 193
distinct feedback patterns. Some of the largest buckets are:

| Pattern | Answers in bucket |
| --- | ---: |
| `00000` | 776 |
| `00002` | 591 |
| `00010` | 550 |
| `01000` | 541 |
| `02000` | 370 |
| `00020` | 340 |

Combining every bucket gives:

```text
entropy(RATES) = 6.10407057 bits
```

The uncertainty ceiling for 10,982 candidates is:

```text
log₂(10,982) = 13.42285320 bits
```

Thus:

```text
normalizedEntropy(RATES)
  = 6.10407057 / 13.42285320
  = 0.45475209
```

The combined raw score is:

```text
rawScore(RATES)
  = 0.82 × 0.45475209
  + 0.06 × 0.97777671
  + 0.12 × 1.0

  = 0.55156332
```

That is the highest initial raw score, so its displayed score becomes `100`.

### Why the solver does not immediately guess `PLANT`

Before receiving any clues, `PLANT` has:

```text
normalizedFrequency = 0.63108666
normalizedCommonness = 1.0
heuristic = 0.71224760
```

It does not reach the initial 200-word entropy shortlist, so at this stage:

```text
rawScore(PLANT) = 0.35 × 0.71224760 = 0.24928666
displayed score = 82.5
```

`PLANT` is a perfectly normal possible answer. It is simply a weaker opening
question than `RATES` because it tests a less informative combination of letters
across the full 10,982-word universe.

### Apply `RATES` against `PLANT`

The hidden answer is:

```text
P L A N T
```

We play:

```text
R A T E S
```

The feedback is:

| Tile | Explanation | State |
| --- | --- | --- |
| `R` | `R` does not occur in `PLANT` | Gray (`0`) |
| `A` | `A` occurs, but in position 3 rather than position 2 | Yellow (`1`) |
| `T` | `T` occurs, but in position 5 rather than position 3 | Yellow (`1`) |
| `E` | `E` does not occur in `PLANT` | Gray (`0`) |
| `S` | `S` does not occur in `PLANT` | Gray (`0`) |

```text
R A T E S
⬛ 🟨 🟨 ⬛ ⬛
0  1  1  0  0
```

The observed pattern is:

```text
01100
```

Exactly 105 words produce `01100` when `RATES` is played against them. The
candidate set therefore falls from 10,982 to 105:

```text
10,982 → 105
```

That removes approximately 99.04% of the starting universe in one guess. This
particular outcome is better than the average implied by 6.10 bits; entropy
scores the guess before knowing which of its 193 patterns will occur.

### Round 2: ranking the remaining 105 words

Because 105 is below the 420-word threshold, the solver now calculates exact
entropy for every surviving candidate.

The new leaders are:

| Rank | Guess | Smart score | Entropy | ESDB tier |
| ---: | --- | ---: | ---: | ---: |
| 1 | `PLAIT` | `100.0` | `4.393322 bits` | 50 |
| 2 | `ADOPT` | `99.5` | `4.192710 bits` | 35 |
| 3 | `LOATH` | `99.4` | `4.214909 bits` | 35 |
| 4 | `GLOAT` | `99.4` | `4.176430 bits` | 35 |
| 5 | `PLANT` | `99.2` | `4.142731 bits` | 35 |

The actual answer has climbed from a non-shortlisted opening option to fifth
place because the new feedback makes its letters and positions highly relevant.

### Calculating `PLAIT` in detail

For the 105 remaining candidates:

```text
positionValue = 112
coverageValue = 294
duplicateCount = 0
N = 105
```

Thus:

```text
frequency(PLAIT)
  = 112 / (5 × 105)
  + 294 / (5 × 105)

  = 0.77333333
```

The minimum and maximum frequency scores in this round are:

```text
minimumFrequency = 0.57261905
maximumFrequency = 0.78666667
```

Therefore:

```text
normalizedFrequency(PLAIT)
  = (0.77333333 - 0.57261905)
    / (0.78666667 - 0.57261905)

  = 0.93770857
```

`PLAIT` is tier 50, so:

```text
normalizedCommonness(PLAIT) = 0.78
```

Its heuristic value is:

```text
heuristic(PLAIT)
  = 0.78 × 0.93770857 + 0.22 × 0.78
  = 0.90301268
```

Against the 105 remaining answers, `PLAIT` creates 34 distinct patterns:

```text
entropy(PLAIT) = 4.39332225 bits
```

The maximum uncertainty is:

```text
log₂(105) = 6.71424552 bits
```

So:

```text
normalizedEntropy(PLAIT)
  = 4.39332225 / 6.71424552
  = 0.65432851
```

Finally:

```text
rawScore(PLAIT)
  = 0.82 × 0.65432851
  + 0.06 × 0.93770857
  + 0.12 × 0.78

  = 0.68641189
```

That is the highest raw score in round two, so `PLAIT` displays `100`.

### Why `PLAIT` ranks above the actual answer

For `PLANT` in the same round:

```text
normalizedFrequency = 0.86651835
normalizedCommonness = 1.0
entropy = 4.14273051 bits
normalizedEntropy = 0.61700611
rawScore = 0.67793611
displayed score = 99.2
```

`PLANT` receives a stronger commonness score, but `PLAIT` has better expected
information and frequency values across the remaining set. The solver does not
know that `PLANT` is the hidden answer. From its perspective, `PLAIT` is a
slightly better question.

This distinction is central to an information-first solver:

> The best next guess is the word expected to improve our knowledge the most,
> not necessarily the candidate that happens to be correct in hindsight.

### Apply `PLAIT` against `PLANT`

```text
Answer: P L A N T
Guess:  P L A I T
```

The feedback is:

| Tile | State |
| --- | --- |
| `P` | Green (`2`) |
| `L` | Green (`2`) |
| `A` | Green (`2`) |
| `I` | Gray (`0`) |
| `T` | Green (`2`) |

```text
P L A I T
🟩 🟩 🟩 ⬛ 🟩
2  2  2  0  2
```

The pattern is:

```text
22202
```

Among the 105 candidates, exactly one word lies in that feedback bucket:

```text
PLANT
```

The candidate path is now:

```text
10,982 ──RATES / 01100──▶ 105 ──PLAIT / 22202──▶ 1
```

### Round 3: one answer remains

When only one candidate remains, no more uncertainty needs to be measured:

```text
guess = PLANT
entropy = 0 bits
smart score = 100
```

Playing `PLANT` returns:

```text
P L A N T
🟩 🟩 🟩 🟩 🟩
2  2  2  2  2
```

The answer is solved in three guesses.

## Why entropy is better than letter frequency alone

Letter frequency is useful but incomplete. Two guesses can contain similarly
common letters while separating the candidate set very differently.

Frequency asks:

```text
Does this word contain letters that occur often?
```

Entropy asks the stronger question:

```text
Across all possible answers, how many different observations can this guess
produce, and how useful are those observations expected to be?
```

A letter may be common in a way that produces the same color for most answers.
That letter has high frequency but limited power to distinguish those answers.
Entropy captures the distinction because it measures complete five-tile
patterns rather than individual letter counts.

## What this model is—and is not

This scoring model is information theory plus hand-designed heuristics. It is
not a neural network, a language model, or a learned AI model.

That is a strength for this task:

- Every recommendation can be explained.
- The same input always produces the same ranking.
- It runs locally without an API.
- It can be tested exhaustively against known answers.
- Its tradeoffs are visible in a few formulas.

The “AI age” improvement here is not adding AI for its own sake. It is using a
more intelligent, explainable decision model and a maintainable data pipeline.

## Current limitations

### 1. Possible answers and possible guesses are the same set

The solver currently ranks only words that still fit every clue. This resembles
Wordle hard mode and keeps recommendations intuitive.

A maximum-information strategy could instead evaluate every allowed word as a
probe, even when that word cannot be the answer. Such a probe can sometimes
eliminate more possibilities than any surviving candidate.

One future interface could offer:

- **Likely answer mode:** recommend only surviving candidates.
- **Maximum information mode:** allow strategic probe words.

### 2. Commonness influences guess quality, not answer probability

All surviving answers currently contribute equally to entropy. A common word
and an obscure word each receive probability `1/N`.

The commonness tier only influences which guess is preferred. A probabilistic
model could instead assign answer priors and calculate weighted entropy. That
would more directly represent the belief that Wordle is likelier to choose a
familiar answer.

### 3. The initial 200-word shortlist is approximate

On large sets, a word outside the heuristic top 200 could theoretically have
excellent entropy. It will not receive exact evaluation until the candidate set
shrinks.

The shortlist is responsible for keeping the initial calculation near 1.5
seconds in the browser. Its quality can be measured and tuned through solver
simulations.

### 4. The weights are deliberate but hand-tuned

The `82% / 6% / 12%` mixture is a practical design decision. It prioritizes
information, retains a small coverage signal, and avoids excessively obscure
recommendations.

It is not mathematically unique. Alternative weights should be judged by
running the solver over a representative answer set and measuring:

- average guesses to solve,
- median guesses,
- failure rate after six turns,
- worst-case guesses,
- proportion of obscure recommendations, and
- first-ranking latency.

### 5. The smart score is relative

The `70–100` number is designed for comparison within the current list. It is
not calibrated as probability, confidence, or expected win rate.

If a more scientific UI is desired, the interface could emphasize:

- entropy in bits,
- expected remaining candidates,
- worst-case remaining candidates, and
- answer prior probability.

## Other useful decision metrics

Entropy is not the only possible objective.

### Expected remaining candidates

For buckets of sizes `n(j)`:

```text
expectedRemaining = Σ n(j)² / N
```

This directly answers: “After playing this word, how many candidates should I
expect to have left?” Lower is better.

### Minimax or worst-case bucket

```text
worstCase = max n(j)
```

This chooses guesses that minimize the largest possible surviving group. It is
more conservative than entropy and can be useful late in a game.

### Solve probability

If guesses are restricted to candidate answers:

```text
solveProbability = priorProbability(guess)
```

This becomes more important when very few candidates remain and the player has
limited turns.

A future model could change priorities by round—for example, maximizing
information early and increasing solve probability or minimizing worst-case
risk near turn six.

## Pseudocode for the current implementation

```text
function recommend(history):
    candidates = allWords matching every observed feedback pattern

    if candidates is empty:
        return []

    if candidates has one word:
        return that word with score 100

    frequencyModel = build frequencies from candidates

    for word in candidates:
        frequency = position coverage
                  + unique-letter coverage
                  - duplicate penalty
        normalizedFrequency = min-max normalize frequency
        commonness = map ESDB tier to 0–1
        heuristic = 0.78 × normalizedFrequency
                  + 0.22 × commonness

    if candidate count > 420:
        entropySet = best 200 words by heuristic
    else:
        entropySet = every candidate

    for word in candidates:
        if word is in entropySet:
            buckets = group every possible answer by feedback(word, answer)
            entropy = -Σ p × log2(p)
            normalizedEntropy = entropy / log2(candidate count)
            rawScore = 0.82 × normalizedEntropy
                     + 0.06 × normalizedFrequency
                     + 0.12 × commonness
        else:
            rawScore = 0.35 × heuristic

    sort descending by rawScore
    break ties by entropy, then alphabetically
    map raw scores onto the display range 70–100
    return ranked words
```

## Where to find the implementation

- `src/lib/solver.js`
  - `scoreGuess`: exact gray/yellow/green evaluation.
  - `filterCandidates`: history-based candidate elimination.
  - `createFrequencyModel`: positional and unique-letter counts.
  - `frequencyScore`: coverage scoring and duplicate penalty.
  - `entropyForGuess`: feedback buckets and Shannon entropy.
  - `rankCandidates`: shortlist, weighted score, sorting, and UI scale.
- `src/lib/rank.worker.js`
  - Runs ranking away from the browser's main UI thread.
- `src/data/words.js`
  - Generated vocabulary and ESDB commonness tiers.
- `src/lib/solver.test.js`
  - Duplicate-letter, filtering, pattern, and commonness tests.

## Summary

The current solver moves toward an answer by repeating three fundamental steps:

1. **Match reality exactly:** retain only words consistent with every Wordle
   pattern entered by the player.
2. **Ask the most useful next question:** prefer guesses expected to divide the
   remaining candidates into informative feedback buckets.
3. **Keep recommendations human:** use letter quality and commonness as smaller
   supporting signals.

In the `PLANT` example, that process was:

```text
10,982 candidates
    ↓ RATES reveals A and T, rejects R/E/S
105 candidates
    ↓ PLAIT confirms P/L/A/T and rejects I
1 candidate
    ↓ PLANT
solved
```

That is the core of the scoring model: every guess is evaluated by how much it
is expected to reduce uncertainty, and every real color pattern turns that
expected information into a smaller, more focused candidate set.
