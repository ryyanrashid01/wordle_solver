import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Database,
  Info,
  LoaderCircle,
  Sigma,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import words, { WORD_SOURCE, wordCommonness } from "@/data/words";
import { buildScoringWalkthrough } from "@/lib/scoring-walkthrough";
import { RANKING_CONFIG } from "@/lib/solver";
import { cn } from "@/lib/utils";

const DEFAULT_WORD = "apple";
const wordSet = new Set(words);

const stateLabel = {
  absent: "Gray — absent",
  present: "Yellow — present elsewhere",
  correct: "Green — correct position",
};

function formatMetric(value, digits = 4) {
  return value == null ? "—" : value.toFixed(digits);
}

function FeedbackTiles({ word, states }) {
  return (
    <div className="flex gap-1.5">
      {[...word].map((letter, index) => (
        <span
          aria-label={`${letter}, ${stateLabel[states[index]]}`}
          className={cn(
            "grid size-11 place-items-center rounded-lg font-mono text-sm font-bold uppercase text-white shadow-sm sm:size-12 sm:text-base",
            states[index] === "absent" && "bg-wordle-absent",
            states[index] === "present" && "bg-wordle-present",
            states[index] === "correct" && "bg-wordle-correct",
          )}
          key={`${word}-${letter}-${index}`}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

function patternWithLetters(word, pattern) {
  return [...word]
    .map((letter, index) => `${letter.toUpperCase()}:${pattern[index]}`)
    .join("  ");
}

function PatternCode({ compact = false, pattern, word }) {
  return (
    <div aria-label={`${patternWithLetters(word, pattern)}, pattern ${pattern}`} className="flex gap-1" role="img">
      {[...pattern].map((digit, index) => (
        <span
          className={cn(
            "flex flex-col overflow-hidden rounded-md font-mono font-bold uppercase text-white",
            compact ? "h-9 w-7 text-[8px]" : "h-12 w-10 text-xs",
            digit === "0" && "bg-wordle-absent",
            digit === "1" && "bg-wordle-present",
            digit === "2" && "bg-wordle-correct",
          )}
          key={`${pattern}-${index}`}
        >
          <span className="grid flex-1 place-items-center">{word[index]}</span>
          <span className="grid h-[42%] place-items-center border-t border-white/20 bg-black/10">{digit}</span>
        </span>
      ))}
    </div>
  );
}

function Formula({ children, label }) {
  return (
    <div>
      {label && <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>}
      <div className="overflow-x-auto rounded-xl border border-border bg-muted/35 px-4 py-3 font-mono text-[11px] leading-6 text-foreground sm:px-5 sm:text-xs">
        {children}
      </div>
    </div>
  );
}

function MathSection({ children, title }) {
  return (
    <div>
      <span className="mb-1 block font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
      <div>{children}</div>
    </div>
  );
}

function RankingTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[580px] border-collapse text-left">
        <thead className="bg-muted/45 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Rank</th>
            <th className="px-4 py-3 font-medium">Guess</th>
            <th className="px-4 py-3 font-medium">Entropy</th>
            <th className="px-4 py-3 font-medium">Letter quality</th>
            <th className="px-4 py-3 font-medium">Commonness</th>
            <th className="px-4 py-3 text-right font-medium">Smart score</th>
          </tr>
        </thead>
        <tbody className="font-mono text-xs">
          {rows.map((candidate, index) => (
            <tr className="border-t border-border" key={candidate.word}>
              <td className="px-4 py-3 text-muted-foreground">#{index + 1}</td>
              <td className="px-4 py-3 font-bold uppercase tracking-[0.12em]">{candidate.word}</td>
              <td className="px-4 py-3">{formatMetric(candidate.entropy)} bits</td>
              <td className="px-4 py-3">{formatMetric(candidate.normalizedFrequency)}</td>
              <td className="px-4 py-3">{formatMetric(candidate.normalizedCommonness, 2)}</td>
              <td className="px-4 py-3 text-right font-bold text-primary">{candidate.score.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Condition({ guess, letter, position, state }) {
  const repeated = [...guess].filter((candidate) => candidate === letter).length > 1;
  const description = {
    absent: repeated
      ? `This copy of ${letter.toUpperCase()} is gray; every matching copy has already been accounted for.`
      : `${letter.toUpperCase()} is not in the answer.`,
    present: `${letter.toUpperCase()} exists, but not in position ${position + 1}.`,
    correct: `${letter.toUpperCase()} is fixed in position ${position + 1}.`,
  }[state];

  return (
    <div className="grid grid-cols-[34px_1fr] gap-3 rounded-xl border border-border bg-muted/20 p-3">
      <span
        className={cn(
          "grid size-8 place-items-center rounded-md font-mono text-xs font-bold uppercase text-white",
          state === "absent" && "bg-wordle-absent",
          state === "present" && "bg-wordle-present",
          state === "correct" && "bg-wordle-correct",
        )}
      >
        {letter}
      </span>
      <p className="self-center text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function ArticleStep({ number, eyebrow, title, children }) {
  return (
    <section className="relative grid gap-4 lg:grid-cols-[72px_minmax(0,1fr)]" id={`step-${number}`}>
      <div className="relative hidden lg:block">
        <span className="sticky top-24 grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10 font-mono text-sm font-bold text-primary">{String(number).padStart(2, "0")}</span>
      </div>
      <Card className="gap-0 border-border bg-card/80 py-0 shadow-[0_16px_60px_rgba(0,0,0,.08)]">
        <CardHeader className="border-b border-border px-5 py-5 sm:px-7 sm:py-6">
          <div>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-primary">Step {number} · {eyebrow}</p>
            <CardTitle className="font-heading text-xl tracking-tight sm:text-2xl">{title}</CardTitle>
          </div>
          <span className="grid size-10 place-items-center rounded-xl bg-muted font-mono text-xs font-bold lg:hidden">{String(number).padStart(2, "0")}</span>
        </CardHeader>
        <CardContent className="space-y-6 p-5 text-sm leading-7 text-muted-foreground sm:p-7">
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

function CandidateTransition({ round }) {
  const removed = ((1 - round.after / round.before) * 100).toFixed(2);
  const difference = round.after - round.analysis.expectedRemaining;
  const comparison = Math.abs(difference) < 0.005
    ? "exactly the average-sized bucket"
    : `a ${difference < 0 ? "smaller" : "larger"} bucket than the average`;

  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.045] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3 font-mono">
        <strong className="text-2xl">{round.before.toLocaleString()}</strong>
        <ArrowRight className="size-4 text-primary" />
        <strong className="text-2xl text-primary">{round.after.toLocaleString()}</strong>
        <Badge className="ml-auto" variant="secondary">{removed}% removed</Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${removed}%` }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Before seeing the colors, this guess was expected to leave {round.analysis.expectedRemaining.toFixed(2)} words on average. This result left {round.after.toLocaleString()}—{comparison}.
      </p>
    </div>
  );
}

function LetterAccounting({ hiddenWord, round }) {
  const answer = hiddenWord.toUpperCase();

  return (
    <section className="space-y-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">Attach every digit to its letter</p>
        <h4 className="mt-1 font-heading text-base font-semibold text-foreground">Read the code in the same order as the guess</h4>
      </div>

      <Formula label="Current row written as letter:state">
        {patternWithLetters(round.guess, round.pattern)} &nbsp;→&nbsp; {round.pattern}
      </Formula>

      <div className="overflow-hidden rounded-xl border border-border">
        {[...round.guess].map((letter, index) => {
          const state = round.states[index];
          const digit = round.pattern[index];
          const upperLetter = letter.toUpperCase();
          let reason;

          if (state === "correct") {
            reason = `${upperLetter} appears in position ${index + 1} in both ${round.guess.toUpperCase()} and ${answer}.`;
          } else if (state === "present") {
            reason = `${answer} contains an unmatched ${upperLetter}, but not in position ${index + 1}.`;
          } else if (hiddenWord.includes(letter)) {
            reason = `${answer} contains ${upperLetter}, but every available copy has already been consumed by a green or yellow match.`;
          } else {
            reason = `${answer} contains no ${upperLetter}.`;
          }

          return (
            <div className="grid gap-3 border-t border-border p-3 first:border-t-0 sm:grid-cols-[120px_130px_1fr] sm:items-center" key={`${round.guess}-${index}`}>
              <strong className="font-mono text-xs uppercase text-foreground">{upperLetter} · position {index + 1}</strong>
              <div className="flex items-center gap-2">
                <PatternCode compact pattern={digit} word={letter} />
                <span className="text-xs">{stateLabel[state]}</span>
              </div>
              <p className="text-xs leading-5">{reason}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <strong className="text-xs text-foreground">1. Mark exact matches first</strong>
          <p className="mt-1 text-xs leading-6">When a guess letter is already in the correct position, mark it green with a 2. That occurrence of the letter has now been used.</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <strong className="text-xs text-foreground">2. Check every other guess letter</strong>
          <p className="mt-1 text-xs leading-6">Mark it yellow with a 1 if the answer still has an unused occurrence of that letter. If no unused occurrence remains, mark it gray with a 0.</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
        <p className="font-medium text-foreground">Why the order matters: APPLE vs ALLEY</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <FeedbackTiles states={["correct", "present", "absent", "present", "absent"]} word="alley" />
          <PatternCode pattern="21010" word="alley" />
        </div>
        <p className="mt-3 text-xs leading-6">APPLE contains only one L. The first L in ALLEY receives yellow and uses that L. There is no second L left for the next tile, so the second L receives gray. This prevents one letter in the answer from matching multiple copies in the guess.</p>
      </div>

      <p className="text-xs leading-6"><strong className="text-foreground">Only 0, 1, and 2 are valid.</strong> The system never uses 3, so any code containing 3 is invalid.</p>
    </section>
  );
}

function PatternPrimer({ hiddenWord, round }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-muted/15 p-4 sm:p-5">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">Start with the colors</p>
        <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">A feedback pattern is just Wordle’s five colors written as data</h3>
      </div>

      <p>Every tile has three possible states. The code uses one digit for each state so patterns can be compared quickly and exactly:</p>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["0", "absent", "Gray", "This letter copy does not match."],
          ["1", "present", "Yellow", "The letter exists somewhere else."],
          ["2", "correct", "Green", "The letter is in this exact position."],
        ].map(([digit, state, title, description]) => (
          <div className="flex gap-3 rounded-xl border border-border bg-card/70 p-3" key={digit}>
            <span className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md font-mono text-xs font-bold text-white",
              state === "absent" && "bg-wordle-absent",
              state === "present" && "bg-wordle-present",
              state === "correct" && "bg-wordle-correct",
            )}>{digit}</span>
            <p className="text-xs leading-5"><strong className="block text-foreground">{title}</strong>{description}</p>
          </div>
        ))}
      </div>

      <p>With <strong className="uppercase text-foreground">{hiddenWord}</strong> as the hidden word, the first comparison produces:</p>
      <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-4 sm:flex-row sm:items-center">
        <FeedbackTiles states={round.states} word={round.guess} />
        <ArrowRight className="size-4 shrink-0 rotate-90 text-primary sm:rotate-0" />
        <PatternCode pattern={round.pattern} word={round.guess} />
        <p className="text-xs leading-5 sm:ml-2"><strong className="uppercase text-foreground">{round.guess}</strong> against <strong className="uppercase text-foreground">{hiddenWord}</strong> becomes <code>{round.pattern}</code>.</p>
      </div>

      <Formula label="How five colors become one reusable pattern">
        <div className="space-y-4">
          <MathSection title="What is being calculated">
            The solver records the state of each guessed letter, in order, as a five-digit pattern.
          </MathSection>
          <MathSection title="The encoding rule">
            pattern(answer, guess) = [state₁, state₂, state₃, state₄, state₅]
          </MathSection>
          <MathSection title="What each part means">
            answer = word the solver is testing as a possible solution<br />
            guess = word being played<br />
            i = position in the word, from 1 through 5<br />
            stateᵢ = color assigned to guess position i<br />
            0 = gray &nbsp;·&nbsp; 1 = yellow &nbsp;·&nbsp; 2 = green<br />
            3 states across 5 positions → 3⁵ = 243 raw codes that the data format can represent
          </MathSection>
          <MathSection title={`Use ${hiddenWord.toUpperCase()} and ${round.guess.toUpperCase()}`}>
            pattern({hiddenWord.toUpperCase()}, {round.guess.toUpperCase()})<br />
            = [{patternWithLetters(round.guess, round.pattern)}]<br />
            = {round.pattern}
          </MathSection>
        </div>
      </Formula>
      <p className="text-xs leading-6">A pattern does not store the letters because the guess already supplies them. The first digit describes the first letter of the guess, the second digit describes the second letter, and so on. The five digits therefore have meaning only when read beside their guess.</p>

      <LetterAccounting hiddenWord={hiddenWord} round={round} />

      <div className="space-y-3 rounded-xl border border-border bg-card/70 p-4">
        <p className="font-medium text-foreground">Why are there {round.analysis.patternCount.toLocaleString()} buckets instead of 3⁵ = 243?</p>
        <p className="text-xs leading-6">The number 243 describes every five-digit string that can be written using 0, 1, and 2. It is the size of the <em>coding system</em>, not a promise that every code can be produced by a real Wordle answer. A bucket is created only when at least one of the current candidate words actually produces that code for <span className="uppercase">{round.guess}</span>.</p>
        {new Set(round.guess).size === round.guess.length && (
          <>
            <p className="text-xs leading-6">First, five codes are impossible under Wordle’s rules for a guess with five different letters. A result cannot contain exactly four green tiles and one yellow tile. The four greens already occupy four answer positions. The yellow letter must appear in a different position, but no other position is available.</p>
            <p className="text-xs leading-6">For example, <code>{patternWithLetters(round.guess, "22221")}</code> cannot occur. The first four greens lock <span className="uppercase">{round.guess.slice(0, 4)}</span> into place. The final <span className="uppercase">{round.guess[4]}</span> is yellow, so it must exist somewhere other than position five—but all four other positions are already occupied by the green letters.</p>
            <div className="rounded-lg bg-muted/35 p-3 font-mono text-xs leading-6 text-foreground">
              243 codes the format can represent<br />
              − 5 four-green-and-one-yellow codes that Wordle cannot produce<br />
              = 238 color patterns possible in principle<br />
              − {238 - round.analysis.patternCount} patterns not produced by any current ESDB candidate<br />
              = {round.analysis.patternCount.toLocaleString()} non-empty buckets actually built
            </div>
          </>
        )}
        <p className="text-xs leading-6">The solver discovers that final number directly: it simulates <span className="uppercase">{round.guess}</span> against every current candidate, stores the resulting pattern in a map, and then counts the map’s distinct keys. For this round, that count is {round.analysis.patternCount.toLocaleString()}.</p>
      </div>
    </section>
  );
}

function BucketPrimer({ round }) {
  const largest = round.analysis.topBuckets[0];

  return (
    <section className="space-y-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">Next, build the buckets</p>
        <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">Answers producing the same pattern are indistinguishable for now</h3>
      </div>
      <p>The solver pretends each of the {round.before.toLocaleString()} candidates is the hidden answer, scores <strong className="uppercase text-foreground">{round.guess}</strong> against it, and places that answer into the bucket named by its pattern.</p>

      <Formula label="How answers are placed into feedback groups">
        <div className="space-y-4">
          <MathSection title="What is being calculated">
            A feedback group contains every candidate answer that would return the same colors for the same guess.
          </MathSection>
          <MathSection title="The grouping rule">
            bucket(pattern, guess)<br />
            = every candidate answer whose simulated feedback equals pattern
          </MathSection>
          <MathSection title="What each part means">
            candidate answer = a dictionary word not ruled out yet<br />
            pattern = one possible sequence of gray, yellow, and green<br />
            bucket size = number of candidates that produce that pattern<br />
            bucket probability = bucket size / all current candidates
          </MathSection>
          <MathSection title={`Use ${round.guess.toUpperCase()} and pattern ${largest.pattern}`}>
            bucket({largest.pattern}, {round.guess.toUpperCase()}) contains {largest.size.toLocaleString()} answers<br />
            probability = {largest.size.toLocaleString()} / {round.before.toLocaleString()} = {largest.probability.toFixed(6)} = {(largest.probability * 100).toFixed(2)}%
          </MathSection>
        </div>
      </Formula>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead className="bg-muted/45 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr><th className="px-4 py-3 font-medium">Pattern</th><th className="px-4 py-3 font-medium">Candidate answers</th><th className="px-4 py-3 text-right font-medium">Bucket size</th><th className="px-4 py-3 text-right font-medium">Probability</th></tr>
          </thead>
          <tbody className="text-xs">
            {round.analysis.topBuckets.map((bucket) => (
              <tr className="border-t border-border" key={bucket.pattern}>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><PatternCode compact pattern={bucket.pattern} word={round.guess} /><code>{bucket.pattern}</code></div></td>
                <td className="px-4 py-3 font-mono uppercase text-muted-foreground">{bucket.examples.join(", ")}…</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-foreground">{bucket.size.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono">{(bucket.probability * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-6">These are only the five largest of {round.analysis.patternCount.toLocaleString()} non-empty buckets. The probability of a bucket is its size divided by {round.before.toLocaleString()}, because the model currently treats each surviving answer as equally possible.</p>

      <div className="flex gap-3 rounded-xl border border-border bg-muted/25 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs leading-6"><strong className="text-foreground">The least helpful response to <span className="uppercase">{round.guess}</span> leaves {largest.size.toLocaleString()} possible answers.</strong> That happens when Wordle returns <code>{patternWithLetters(round.guess, largest.pattern)}</code>. Every word in that bucket produces exactly those colors, so the feedback rules out all other words but cannot yet distinguish among these {largest.size.toLocaleString()} survivors.</p>
      </div>
    </section>
  );
}

function EqualBucketExample({ bits, groups }) {
  const remaining = 100 / groups;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <strong className="block text-sm text-foreground">{groups === 1 ? "No split" : `${groups} equal feedback groups`} → {bits} {bits === 1 ? "bit" : "bits"}</strong>
      <p className="mt-1 text-xs leading-5">Start with 100 possible answers.</p>
      <div className="my-3 flex h-8 overflow-hidden rounded-lg border border-border bg-card">
        {Array.from({ length: groups }, (_, index) => (
          <span
            className={cn(
              "grid place-items-center border-l border-background/70 text-[9px] font-bold first:border-l-0",
              index % 3 === 0 && "bg-primary/80 text-primary-foreground",
              index % 3 === 1 && "bg-wordle-present text-white",
              index % 3 === 2 && "bg-wordle-absent text-white",
            )}
            key={index}
            style={{ width: `${100 / groups}%` }}
          >
            {remaining}
          </span>
        ))}
      </div>
      <p className="text-xs leading-5">The returned colors identify one group, leaving <strong className="text-foreground">{remaining} possible {remaining === 1 ? "answer" : "answers"}</strong>.</p>
    </div>
  );
}

function UnevenBucketExample() {
  return (
    <div className="space-y-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 sm:p-5">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">What changes when the groups are uneven?</p>
        <h4 className="mt-1 font-heading text-base font-semibold text-foreground">A 90/10 split is less useful than a 50/50 split</h4>
      </div>

      <p>Suppose 100 answers remain. One feedback pattern matches 90 of them, while another pattern matches the remaining 10.</p>

      <div className="flex h-10 overflow-hidden rounded-lg border border-border bg-card font-mono text-xs font-bold">
        <span className="grid w-[90%] place-items-center bg-primary/80 text-primary-foreground">90 answers · 90% chance</span>
        <span className="grid w-[10%] place-items-center bg-wordle-present text-white">10</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/70 p-4">
          <strong className="text-foreground">Most of the time</strong>
          <p className="mt-1 text-xs leading-6">There is a 90% chance Wordle returns the common pattern and leaves 90 possible answers. Very little was learned.</p>
        </div>
        <div className="rounded-xl border border-border bg-card/70 p-4">
          <strong className="text-foreground">Occasionally</strong>
          <p className="mt-1 text-xs leading-6">There is a 10% chance Wordle returns the rare pattern and leaves only 10 answers. That result is much more informative.</p>
        </div>
      </div>

      <p><strong className="text-foreground">Probability-weighted average means likely outcomes count more.</strong> Averaging 90 and 10 as <code>(90 + 10) / 2 = 50</code> would wrongly pretend both outcomes have a 50% chance. Their real probabilities must be used:</p>

      <Formula label="How to calculate the average number of answers left">
        <div className="space-y-4">
          <MathSection title="What is being calculated">
            Before the colors arrive, several results are possible. The expected remainder is the average number of answers that will survive, with likely results counting more than unlikely ones.
          </MathSection>
          <MathSection title="The calculation rule">
            expected answers left = Σ [chance of a result × answers left after that result]
          </MathSection>
          <MathSection title="What each part means">
            Σ = repeat the multiplication for every possible feedback result, then add everything<br />
            chance of a result = its bucket size / all current candidates<br />
            answers left = size of that result’s bucket
          </MathSection>
          <MathSection title="Use the 90/10 example">
            expected answers left = 0.90 × 90 + 0.10 × 10<br />
            = 81 + 1<br />
            = 82 answers
          </MathSection>
        </div>
      </Formula>

      <p>Entropy applies the same weighting idea to information. The common 90% result contributes little surprise; the rare 10% result contributes much more, but it happens less often.</p>

      <Formula label="How to calculate average information">
        <div className="space-y-4">
          <MathSection title="What H means">
            H is the standard mathematical symbol for Shannon entropy. Here, H means the average information expected from the possible Wordle feedback results, measured in bits.
          </MathSection>
          <MathSection title="The calculation rule">
            H = Σ p(k) × [−log₂ p(k)]
          </MathSection>
          <MathSection title="What each part means">
            k = one possible feedback pattern<br />
            p(k) = chance of receiving that pattern<br />
            −log₂ p(k) = information supplied if that pattern appears<br />
            Σ = calculate this for every possible pattern and add the results<br />
            Multiplying by p(k) makes common outcomes count more often than rare outcomes.
          </MathSection>
          <MathSection title="Use the 90/10 example">
            H = 0.90 × [−log₂(0.90)] + 0.10 × [−log₂(0.10)]<br />
            &nbsp;&nbsp;= 0.90 × 0.152 + 0.10 × 3.322<br />
            &nbsp;&nbsp;= 0.469 bits
          </MathSection>
        </div>
      </Formula>

      <div className="space-y-4 rounded-xl border border-border bg-card/70 p-4">
        <div>
          <strong className="text-foreground">What does 0.469 bits mean in ordinary language?</strong>
          <p className="mt-1 text-xs leading-6">Before the colors appear, this 90/10 split is expected to provide only 46.9% as much information as one perfect 50/50 split.</p>
        </div>

        <div>
          <div className="relative h-3 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: "46.9%" }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground">
            <span>0 bits · learned nothing</span>
            <span className="text-primary">0.469 bits</span>
            <span>1 bit · cut uncertainty in half</span>
          </div>
        </div>

        <p className="text-xs leading-6">Think of a heavily biased coin that lands heads 90% of the time. Seeing heads is unsurprising and teaches little; seeing tails is surprising and teaches much more. Before the flip, the average amount learned about <em>which result will occur</em> is 0.469 bits. The Wordle split behaves the same way: before the colors appear, the solver does not know whether the hidden answer belongs to the 90-word feedback bucket or the 10-word feedback bucket. The colors reveal which bucket contains the answer, thereby ruling out every word in the other bucket. Because the 90-word result happens nine times out of ten, the guess usually leaves almost all candidates possible; the much more useful 10-word result occurs only once in ten. Averaged across both possible results, the feedback provides 0.469 bits of information about which words can still be the hidden answer.</p>

        <p className="text-xs leading-6"><strong className="text-foreground">It does not mean that 46.9% of the words are removed.</strong> Bits measure reduction in uncertainty, not a direct percentage of eliminated candidates. Candidate count uses the separate expected-remainder calculation, which is 82 words for this example.</p>
      </div>
    </div>
  );
}

function EntropyPrimer({ round }) {
  const winner = round.ranking[0];
  const largest = round.analysis.topBuckets[0];
  const largestSurprise = -Math.log2(largest.probability);
  const largestContribution = largest.probability * largestSurprise;
  const equalBucketMaximum = Math.log2(round.analysis.patternCount);
  const equalBucketEquivalent = 2 ** winner.entropy;
  const equalBucketSize = round.before / equalBucketEquivalent;

  return (
    <section className="space-y-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">Then, measure information</p>
        <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">Shannon entropy rewards guesses that divide the possibilities evenly</h3>
      </div>

      <p>Shannon entropy comes from information theory. It measures the <strong className="text-foreground">average amount of uncertainty removed</strong> when the feedback arrives. In a perfectly even split, one bit represents one halving of the possibilities: 100 answers become 50. Two bits represent two halvings: 100 become 50, then 25.</p>

      <div className="grid gap-2 sm:grid-cols-3">
        <EqualBucketExample bits={0} groups={1} />
        <EqualBucketExample bits={1} groups={2} />
        <EqualBucketExample bits={2} groups={4} />
      </div>

      <Formula label="Information from equally sized feedback groups">
        <div className="space-y-4">
          <MathSection title="What is being calculated">
            When every feedback group is the same size, the number of bits tells how many times the original candidate set was cut in half.
          </MathSection>
          <MathSection title="The calculation rule">
            information gained = log₂(number of equal groups)
          </MathSection>
          <MathSection title="What log₂ means">
            log₂ asks how many times the number of groups can be divided by 2 before reaching 1.
          </MathSection>
          <MathSection title="Use the three examples above">
            1 group → log₂(1) = 0 bits<br />
            2 groups → log₂(2) = 1 bit<br />
            4 groups → log₂(4) = 2 bits
          </MathSection>
        </div>
      </Formula>

      <UnevenBucketExample />

      <p>A rare pattern is more informative than a common one because it rules out more of the candidate set. The calculation <code>−log₂(probability)</code> converts the chance of one result into bits. Shannon entropy then averages those bits across every possible result.</p>

      <Formula label="Information contributed by one possible result">
        <div className="space-y-4">
          <MathSection title="What is being calculated">
            First calculate how much one feedback result would teach us. Then multiply by its chance of occurring so its contribution reflects how often we expect to see it.
          </MathSection>
          <MathSection title="The calculation rules">
            information in result k = −log₂[chance of result k]<br />
            weighted contribution = chance of result k × information in result k
          </MathSection>
          <MathSection title="What each part means">
            k = one feedback pattern<br />
            chance of k = number of answers in its bucket / all current candidates<br />
            information in k = bits gained if Wordle returns that pattern
          </MathSection>
          <MathSection title={`Use pattern ${largest.pattern}`}>
            chance = {largest.size.toLocaleString()} / {round.before.toLocaleString()} = {largest.probability.toFixed(6)}<br />
            information = −log₂({largest.probability.toFixed(6)}) = {largestSurprise.toFixed(4)} bits<br />
            contribution = {largest.probability.toFixed(6)} × {largestSurprise.toFixed(4)} = {largestContribution.toFixed(4)} bits
          </MathSection>
        </div>
      </Formula>

      <Formula label="Average information across every possible result">
        <div className="space-y-4">
          <MathSection title="What H(guess) means">
            H(guess) is the Shannon entropy of a guess: the average number of information bits its feedback is expected to provide.
          </MathSection>
          <MathSection title="The calculation rule">
            H(g) = Σ p(k) × I(k) = −Σ p(k) × log₂ p(k)
          </MathSection>
          <MathSection title="What each part means">
            g = guess being evaluated<br />
            k = one feedback pattern produced by g<br />
            p(k) = chance that Wordle returns pattern k<br />
            I(k) = information provided by pattern k<br />
            Σ = add the contribution from every non-empty pattern bucket
          </MathSection>
          <MathSection title={`Use all ${round.analysis.patternCount.toLocaleString()} ${winner.word.toUpperCase()} results`}>
            H({winner.word.toUpperCase()}) = contribution(k₁) + contribution(k₂) + … + contribution(k<sub>{round.analysis.patternCount}</sub>)<br />
            H({winner.word.toUpperCase()}) = {winner.entropy.toFixed(4)} bits
          </MathSection>
        </div>
      </Formula>

      <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.045] p-4">
        <p className="font-medium text-foreground">What does H({winner.word.toUpperCase()}) = {winner.entropy.toFixed(4)} bits mean?</p>
        <p className="text-xs leading-6">It does not mean that the word bank is divided into {Math.floor(winner.entropy)} pools. One bit represents one perfect halving. Every additional bit doubles the number of equally likely groups: 1 bit corresponds to 2 equal groups, 2 bits to 4, 3 bits to 8, and 6 bits to 64.</p>
        <div className="rounded-lg bg-muted/35 p-3 font-mono text-xs leading-6 text-foreground">
          equivalent number of equal groups = 2<sup>entropy</sup><br />
          = 2<sup>{winner.entropy.toFixed(4)}</sup><br />
          = {equalBucketEquivalent.toFixed(1)} equally likely groups
        </div>
        <p className="text-xs leading-6">In natural language, {winner.entropy.toFixed(4)} bits is a little more information than six perfect yes-or-no halvings. It has the same entropy as an idealized split of the {round.before.toLocaleString()} candidates into about {Math.round(equalBucketEquivalent)} equally likely groups. If those groups were truly equal, each would contain about {Math.round(equalBucketSize).toLocaleString()} words.</p>
        <p className="text-xs leading-6"><strong className="text-foreground">That is an interpretation of the entropy value, not the solver’s actual bucket layout.</strong> {winner.word.toUpperCase()} really creates {round.analysis.patternCount.toLocaleString()} non-empty buckets of very different sizes. Their uneven probabilities reduce their combined information to the equivalent of only about {Math.round(equalBucketEquivalent)} equal groups, which is why the actual expected remainder is {round.analysis.expectedRemaining.toFixed(2)} rather than {equalBucketSize.toFixed(2)}.</p>
      </div>

      <p><strong className="text-foreground">Pattern count alone does not measure information.</strong> Bucket sizes matter too. If all {round.analysis.patternCount} buckets were equally likely, entropy would be {equalBucketMaximum.toFixed(4)} bits. The actual value is lower—{winner.entropy.toFixed(4)} bits—because some feedback results are much more likely than others and leave much larger groups behind.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="font-medium text-foreground">Expected remainder: {round.analysis.expectedRemaining.toFixed(2)}</p>
          <p className="mt-2 text-xs leading-6">Applying the weighted-average method explained above across all {round.analysis.patternCount.toLocaleString()} feedback groups leaves {round.analysis.expectedRemaining.toFixed(2)} candidates on average.</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="font-medium text-foreground">Worst case: {round.analysis.worstCase.toLocaleString()}</p>
          <p className="mt-2 text-xs leading-6">This is the single largest bucket. Even with the least helpful possible colors, no more than {round.analysis.worstCase.toLocaleString()} candidates survive this guess.</p>
        </div>
      </div>
      <p className="text-xs leading-6">Entropy, expected remainder, and worst case describe related but different properties: average information on a logarithmic scale, average survivors on a word-count scale, and the least favorable single outcome.</p>
    </section>
  );
}

function MetricLegend({ round, winner }) {
  const quality = round.letterQuality;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-heading text-lg font-semibold text-foreground">Where the four ranking values come from</h3>
        <p className="mt-1 text-xs leading-6">Every value in the table is calculated from the current candidate set. These are the inputs for <span className="uppercase">{winner.word}</span> in this round.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          [
            "Entropy",
            `${winner.entropy.toFixed(4)} bits`,
            `Simulate ${winner.word.toUpperCase()} against all ${round.before.toLocaleString()} possible answers, build ${round.analysis.patternCount.toLocaleString()} feedback buckets, and take the probability-weighted average information.`,
          ],
          [
            "Letter quality",
            winner.normalizedFrequency.toFixed(4),
            `Start with ${quality.positionValue.toLocaleString()} same-position matches and ${quality.coverageValue.toLocaleString()} distinct-letter coverage matches, apply the duplicate penalty, then normalize the raw result against every word this round.`,
          ],
          [
            "Commonness",
            winner.normalizedCommonness.toFixed(2),
            `${winner.word.toUpperCase()} first appears in ESDB tier ${winner.commonness}. The solver’s tier table maps that familiarity tier to ${winner.normalizedCommonness.toFixed(2)}. This is a vocabulary preference, not an answer probability.`,
          ],
          [
            "Smart score",
            winner.score.toFixed(1),
            `Combine 82% normalized entropy, 6% normalized letter quality, and 12% commonness, then stretch this round’s raw-score range onto 70–100 without changing its order.`,
          ],
        ].map(([title, value, description]) => (
          <div className="rounded-xl border border-border bg-muted/20 p-4" key={title}>
            <div className="flex items-baseline justify-between gap-3">
              <strong className="text-sm text-foreground">{title}</strong>
              <span className="font-mono text-sm font-semibold text-primary">{value}</span>
            </div>
            <p className="mt-2 text-xs leading-6">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LetterQualityExplanation({ round, winner }) {
  const quality = round.letterQuality;
  const denominator = round.before * 5;
  const positionCountFormula = quality.positionCounts
    .map(({ count }) => count.toLocaleString())
    .join(" + ");
  const coverageCountFormula = quality.coverageCounts
    .map(({ count }) => count.toLocaleString())
    .join(" + ");

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-muted/15 p-4 sm:p-5">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">Letter quality, step by step</p>
        <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">Does {winner.word.toUpperCase()} test letters that are useful in this candidate set?</h3>
      </div>

      <p>Letter quality is a fast estimate used before the more expensive bucket simulation. It rewards a guess when its letters commonly occur in useful positions and when its distinct letters cover many possible answers. Repeated letters receive a small penalty because an exploratory guess usually learns more by testing five different letters.</p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/70 p-4">
          <p className="font-medium text-foreground">1. Same-position fit</p>
          <p className="mt-1 text-xs leading-6">For each tile, count candidates containing that letter in that exact position.</p>
          <div className="mt-3 space-y-1.5 font-mono text-xs">
            {quality.positionCounts.map(({ count, letter, position }) => (
              <div className="flex justify-between gap-4" key={`${letter}-${position}`}>
                <span><span className="uppercase">{letter}</span> in position {position}</span>
                <strong className="text-foreground">{count.toLocaleString()}</strong>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-border pt-2">
              <span>Total position fit</span>
              <strong className="text-foreground">{quality.positionValue.toLocaleString()}</strong>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-muted/35 p-3">
            <strong className="text-xs text-foreground">Why this helps</strong>
            <p className="mt-1 text-xs leading-6">This rewards letters with a good chance of becoming green immediately. A green tile identifies both a letter and its position, so it is more specific than merely discovering that the letter exists somewhere. It also favors guesses shaped like plausible remaining answers instead of words whose useful letters sit in unusual positions.</p>
            <p className="mt-2 font-mono text-[11px] text-primary">Adds +{quality.positionContribution.toFixed(6)} to raw letter quality</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/70 p-4">
          <p className="font-medium text-foreground">2. Distinct-letter coverage</p>
          <p className="mt-1 text-xs leading-6">For each different guessed letter, count candidates containing it anywhere. A candidate contributes at most once per letter, even when that letter repeats.</p>
          <div className="mt-3 space-y-1.5 font-mono text-xs">
            {quality.coverageCounts.map(({ count, letter }) => (
              <div className="flex justify-between gap-4" key={letter}>
                <span>contains <span className="uppercase">{letter}</span></span>
                <strong className="text-foreground">{count.toLocaleString()}</strong>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-border pt-2">
              <span>Total coverage</span>
              <strong className="text-foreground">{quality.coverageValue.toLocaleString()}</strong>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-muted/35 p-3">
            <strong className="text-xs text-foreground">Why this helps</strong>
            <p className="mt-1 text-xs leading-6">Each different letter asks a broad question about the hidden answer: does it contain this letter at all? A gray result removes candidates containing it; a yellow or green result removes candidates that do not contain it. Letters appearing across many candidates therefore test a large part of the word bank, even when they are not in their most common position.</p>
            <p className="mt-2 text-xs leading-6">This count is only a fast approximation. It does not know whether the resulting groups are balanced or whether several letters cover the same words. The later entropy calculation measures those exact feedback splits and corrects the approximation.</p>
            <p className="mt-2 font-mono text-[11px] text-primary">Adds +{quality.coverageContribution.toFixed(6)} to raw letter quality</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/70 p-4">
        <p className="font-medium text-foreground">3. Repeated-letter penalty</p>
        <p className="mt-1 text-xs leading-6"><span className="uppercase">{winner.word}</span> has {5 - quality.duplicateCount} distinct letters, so it has {quality.duplicateCount} repeated {quality.duplicateCount === 1 ? "copy" : "copies"}. Its penalty is 0.035 × {quality.duplicateCount} = {quality.duplicatePenalty.toFixed(3)}.</p>
        <div className="mt-3 rounded-lg bg-muted/35 p-3">
          <strong className="text-xs text-foreground">Why this helps</strong>
          <p className="mt-1 text-xs leading-6">A second copy of the same letter checks repetition, but it does not test a new letter. When thousands of answers remain, five different letters usually explore more possibilities than four letters with one repeated. The penalty is deliberately small: if repeated letters become useful later, strong entropy can still make that word win.</p>
          <p className="mt-2 font-mono text-[11px] text-primary">Contribution to raw letter quality: −{quality.duplicatePenalty.toFixed(3)}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.045] p-4">
        <p className="font-medium text-foreground">What job does letter quality perform in the complete ranking?</p>
        <p className="text-xs leading-6">Calculating exact entropy for every one of the {round.before.toLocaleString()} possible guesses against all {round.before.toLocaleString()} possible answers would require tens of millions of Wordle comparisons. Letter quality is the inexpensive first pass that identifies promising words before that simulation.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card/70 p-3">
            <strong className="text-xs text-foreground">Job 1: choose the entropy shortlist</strong>
            <p className="mt-1 text-xs leading-6">The initial screening score is 78% normalized letter quality and 22% commonness. The best {RANKING_CONFIG.shortlistSize} words advance to exact feedback-bucket simulation.</p>
            <p className="mt-2 font-mono text-[11px] leading-5 text-foreground">0.78 × {winner.normalizedFrequency.toFixed(6)} + 0.22 × {winner.normalizedCommonness.toFixed(6)} = {winner.heuristic.toFixed(6)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card/70 p-3">
            <strong className="text-xs text-foreground">Job 2: refine the final ranking</strong>
            <p className="mt-1 text-xs leading-6">After entropy is known, letter quality receives only 6% of the final raw Smart Score. It can separate guesses with similar information gain, but it normally cannot overpower a meaningfully better entropy result.</p>
            <p className="mt-2 font-mono text-[11px] leading-5 text-foreground">0.06 × {winner.normalizedFrequency.toFixed(6)} = {(RANKING_CONFIG.frequencyWeight * winner.normalizedFrequency).toFixed(6)}</p>
          </div>
        </div>
      </div>

      <Formula label={`Calculate the raw letter quality for ${winner.word.toUpperCase()}`}>
        <div className="space-y-4">
          <MathSection title="First average the same-position match rates">
            Dividing one position’s count by {round.before.toLocaleString()} tells us what fraction of candidates place that letter in that exact position. We calculate that rate for all five tiles and take their average.<br /><br />
            average same-position match rate<br />
            = ({positionCountFormula}) / (5 × {round.before.toLocaleString()})<br />
            = {quality.positionValue.toLocaleString()} / {denominator.toLocaleString()}<br />
            = {quality.positionContribution.toFixed(6)} = {(quality.positionContribution * 100).toFixed(2)}%
          </MathSection>
          <MathSection title="What that percentage means">
            Choose one of {winner.word.toUpperCase()}’s five tiles and one candidate word at random. There is an average {(quality.positionContribution * 100).toFixed(2)}% chance that the candidate has the tile’s letter in that same position. This signal favors letters that are likely to turn green.
          </MathSection>
          <MathSection title="Then average the anywhere-in-the-word coverage rates">
            Each count now tells how many candidates contain that letter anywhere. We again divide by {round.before.toLocaleString()} to make each count a fraction, then average across the five available guess tiles.<br /><br />
            average distinct-letter coverage rate<br />
            = ({coverageCountFormula}) / (5 × {round.before.toLocaleString()})<br />
            = {quality.coverageValue.toLocaleString()} / {denominator.toLocaleString()}<br />
            = {quality.coverageContribution.toFixed(6)} = {(quality.coverageContribution * 100).toFixed(2)}%
          </MathSection>
          <MathSection title="What that percentage means">
            On average, one of {winner.word.toUpperCase()}’s distinct letters occurs somewhere in {(quality.coverageContribution * 100).toFixed(2)}% of the candidate words. This signal rewards letters likely to produce either yellow or green feedback. A repeated letter is counted only once here, because it does not test a new letter.
          </MathSection>
          <MathSection title="Finally combine the two signals and the penalty">
            raw letter quality<br />
            = average same-position rate + average coverage rate − repeated-letter penalty<br />
            = {quality.positionContribution.toFixed(6)} + {quality.coverageContribution.toFixed(6)} − {quality.duplicatePenalty.toFixed(3)}<br />
            = {quality.rawScore.toFixed(6)}
          </MathSection>
        </div>
      </Formula>

      <p className="text-xs leading-6"><strong className="text-foreground">The raw value {quality.rawScore.toFixed(6)} is not a probability or a percentage of words eliminated.</strong> It is the sum of two deliberately different usefulness signals. The next calculation compares that raw value with all other guesses in this round.</p>

      <Formula label="Convert the raw result to the table’s 0–1 letter-quality value">
        <div className="space-y-4">
          <MathSection title="What normalization does">
            The raw number has meaning only relative to the current candidate set. The worst raw letter-quality value this round becomes 0, the best becomes 1, and every other word is placed proportionally between them.
          </MathSection>
          <MathSection title="The calculation rule">
            normalized letter quality = (word’s raw value − round minimum) / (round maximum − round minimum)
          </MathSection>
          <MathSection title={`Use the ${winner.word.toUpperCase()} value`}>
            F<sub>norm</sub> = [{quality.rawScore.toFixed(6)} − {winner.minFrequency.toFixed(6)}] / [{winner.maxFrequency.toFixed(6)} − {winner.minFrequency.toFixed(6)}]<br />
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {winner.normalizedFrequency.toFixed(6)}
          </MathSection>
        </div>
      </Formula>

      <p className="text-xs leading-6"><strong className="text-foreground">A letter quality of {winner.normalizedFrequency.toFixed(4)} is not a {Math.round(winner.normalizedFrequency * 100)}% chance of solving the word.</strong> It means {winner.word.toUpperCase()} lies about {Math.round(winner.normalizedFrequency * 100)}% of the way from this round’s worst raw letter-quality value to its best one.</p>
    </section>
  );
}

function ScoreExplanation({ hiddenWord, opening = false, round }) {
  const winner = round.ranking[0];
  const entropyContribution = winner.normalizedEntropy * RANKING_CONFIG.entropyWeight;
  const frequencyContribution = winner.normalizedFrequency * RANKING_CONFIG.frequencyWeight;
  const commonnessContribution = winner.normalizedCommonness * RANKING_CONFIG.commonnessWeight;

  return (
    <div className="space-y-6">
      <p>
        {opening
          ? <>With all <strong className="text-foreground">{round.before.toLocaleString()} ESDB words</strong> still possible, the solver asks which word will split that universe into the most useful feedback groups.</>
          : <>The frequency model and feedback buckets are rebuilt using only the <strong className="text-foreground">{round.before.toLocaleString()} survivors</strong>. Evidence has changed the problem, so every candidate is scored again from scratch.</>}
      </p>

      {opening && (
        <>
          <PatternPrimer hiddenWord={hiddenWord} round={round} />
          <BucketPrimer round={round} />
          <EntropyPrimer round={round} />
          <Separator />
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">Finally, compare possible guesses</p>
            <h3 className="mt-1 font-heading text-lg font-semibold text-foreground">Run the same bucket experiment for every shortlisted word</h3>
            <p className="mt-2"><span className="uppercase">{round.guess}</span> is not compared with the hidden word while ranking. Every candidate first receives the inexpensive letter-quality and commonness scores. Because this round has more than {RANKING_CONFIG.shortlistThreshold} candidates, the strongest {RANKING_CONFIG.shortlistSize} are then simulated against the entire answer universe to calculate exact entropy. Those results are combined below.</p>
          </div>
        </>
      )}

      <div>
        <p className="mb-3 font-medium text-foreground">The top {round.ranking.length} recommendations at this point</p>
        <RankingTable rows={round.ranking} />
      </div>

      {opening && (
        <>
          <MetricLegend round={round} winner={winner} />
          <LetterQualityExplanation round={round} winner={winner} />
        </>
      )}

      <p>
        <strong className="uppercase text-foreground">{winner.word}</strong> wins the combined ranking with {winner.entropy.toFixed(4)} entropy bits, {winner.normalizedFrequency.toFixed(4)} letter quality, and {winner.normalizedCommonness.toFixed(2)} commonness. The table is sorted by the weighted score—not by entropy alone—so a small advantage in letter quality or familiarity can decide a close contest.
      </p>

      <div className="space-y-3">
        <p className="font-medium text-foreground">How its score is assembled</p>
        <p>Each signal is normalized to a 0–1 scale. Information gain dominates; positional letter quality and ESDB commonness resolve closer contests.</p>
        <Formula label="Convert all three scoring inputs to a 0–1 scale">
          <div className="space-y-4">
            <MathSection title="Why this conversion is needed">
              Entropy is measured in bits, letter quality starts as a frequency value, and commonness starts as an ESDB tier. Converting them to the same 0–1 range lets the solver combine them fairly.
            </MathSection>
            <MathSection title="Convert information gain">
              H<sub>norm</sub>(g) = H(g) / log₂(N)<br />
              H(g) = average information supplied by guess g, in bits<br />
              log₂(N) = total uncertainty among N equally likely candidate answers<br />
              H<sub>norm</sub>(g) = fraction of that uncertainty the guess is expected to remove
            </MathSection>
            <MathSection title="Build and convert letter quality">
              F(g) = positionFit(g)/(5N) + uniqueCoverage(g)/(5N) − 0.035 × duplicates(g)<br />
              F<sub>norm</sub>(g) = [F(g) − F<sub>min</sub>] / [F<sub>max</sub> − F<sub>min</sub>]<br />
              positionFit = how often each letter appears in that same position<br />
              uniqueCoverage = how many candidates contain each distinct guessed letter<br />
              duplicates = repeated letter copies beyond the first<br />
              F<sub>min</sub> and F<sub>max</sub> = lowest and highest raw letter-quality values this round
            </MathSection>
            <MathSection title="Convert ESDB commonness">
              C<sub>norm</sub>(g) = tierLookup(ESDB tier of g)<br />
              tier ≤ 35 → 1.00 &nbsp;·&nbsp; tier 40 → 0.92 &nbsp;·&nbsp; tier 50 → 0.78<br />
              tier 60 → 0.62 &nbsp;·&nbsp; tier 65 → 0.50 &nbsp;·&nbsp; tier 70 → 0.35 &nbsp;·&nbsp; tier 80 → 0.15<br />
              Lower ESDB tiers represent more familiar words.
            </MathSection>
            <MathSection title={`Use ${winner.word.toUpperCase()} values from this round`}>
              g = {winner.word.toUpperCase()} &nbsp;·&nbsp; N = {round.before.toLocaleString()} candidates<br />
              H<sub>norm</sub> = {winner.entropy.toFixed(4)} / log₂({round.before.toLocaleString()}) = {winner.normalizedEntropy.toFixed(6)}<br />
              F<sub>norm</sub> = [{winner.frequency.toFixed(6)} − {winner.minFrequency.toFixed(6)}] / [{winner.maxFrequency.toFixed(6)} − {winner.minFrequency.toFixed(6)}] = {winner.normalizedFrequency.toFixed(6)}<br />
              C<sub>norm</sub> = tierLookup({winner.commonness}) = {winner.normalizedCommonness.toFixed(6)}
            </MathSection>
          </div>
        </Formula>
        <Formula label="Combine information, letter quality, and commonness">
          <div className="space-y-4">
            <MathSection title="What the raw score means">
              The raw score is the solver’s internal ranking value. A larger value means the guess offers a better combination of information, useful letters, and familiar vocabulary.
            </MathSection>
            <MathSection title="The calculation rule">
              S<sub>raw</sub>(g) = w<sub>H</sub>H<sub>norm</sub>(g) + w<sub>F</sub>F<sub>norm</sub>(g) + w<sub>C</sub>C<sub>norm</sub>(g)
            </MathSection>
            <MathSection title="What each part means">
              S<sub>raw</sub>(g) = internal raw score for guess g<br />
              H<sub>norm</sub>(g) = normalized information gain<br />
              F<sub>norm</sub>(g) = normalized letter quality<br />
              C<sub>norm</sub>(g) = normalized commonness<br />
              w = weight controlling how strongly each input affects the result
            </MathSection>
            <MathSection title="The solver’s chosen priorities">
              w<sub>H</sub> = {RANKING_CONFIG.entropyWeight.toFixed(2)} → 82% information gain<br />
              w<sub>F</sub> = {RANKING_CONFIG.frequencyWeight.toFixed(2)} → 6% letter quality<br />
              w<sub>C</sub> = {RANKING_CONFIG.commonnessWeight.toFixed(2)} → 12% commonness<br />
              {RANKING_CONFIG.entropyWeight.toFixed(2)} + {RANKING_CONFIG.frequencyWeight.toFixed(2)} + {RANKING_CONFIG.commonnessWeight.toFixed(2)} = 1.00
              <br />These weights are deliberate solver-design choices, not constants from Shannon’s theory. Information gain receives most of the influence; the other signals break close ties and reduce obscure recommendations.
            </MathSection>
            <MathSection title={`Use ${winner.word.toUpperCase()} values`}>
              S<sub>raw</sub> = {RANKING_CONFIG.entropyWeight.toFixed(2)} × {winner.normalizedEntropy.toFixed(6)} + {RANKING_CONFIG.frequencyWeight.toFixed(2)} × {winner.normalizedFrequency.toFixed(6)} + {RANKING_CONFIG.commonnessWeight.toFixed(2)} × {winner.normalizedCommonness.toFixed(6)}<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {entropyContribution.toFixed(6)} + {frequencyContribution.toFixed(6)} + {commonnessContribution.toFixed(6)}<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {winner.rawScore.toFixed(6)}
            </MathSection>
          </div>
        </Formula>
        <Formula label="Convert the raw ranking value into the displayed score">
          <div className="space-y-4">
            <MathSection title="Why the displayed score is different">
              Raw scores are useful for sorting but awkward to read. The interface stretches the current round’s raw-score range onto 70–100 without changing the ranking order.
            </MathSection>
            <MathSection title="The calculation rule">
              S<sub>display</sub>(g) = 70 + 30 × [S<sub>raw</sub>(g) − S<sub>min</sub>] / [S<sub>max</sub> − S<sub>min</sub>]
            </MathSection>
            <MathSection title="What each part means">
              S<sub>display</sub>(g) = score shown in the interface<br />
              S<sub>raw</sub>(g) = internal weighted score for guess g<br />
              S<sub>min</sub> = lowest raw score in the current round<br />
              S<sub>max</sub> = highest raw score in the current round<br />
              70 = displayed floor &nbsp;·&nbsp; 30 = width from 70 to 100<br />
              This score compares guesses within one round; it is not a probability of being correct.
            </MathSection>
            <MathSection title={`Use the winning ${winner.word.toUpperCase()} score`}>
              {round.scoreRange.maximum === round.scoreRange.minimum ? (
                <>S<sub>max</sub> = S<sub>min</sub>, so every candidate is tied and receives 100.0.</>
              ) : (
                <>
                  S<sub>display</sub> = 70 + 30 × [{winner.rawScore.toFixed(6)} − {round.scoreRange.minimum.toFixed(6)}] / [{round.scoreRange.maximum.toFixed(6)} − {round.scoreRange.minimum.toFixed(6)}]<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {winner.score.toFixed(1)}
                </>
              )}
            </MathSection>
          </div>
        </Formula>
      </div>

      {round.before > RANKING_CONFIG.shortlistThreshold && (
        <div className="flex gap-3 rounded-xl border border-border bg-muted/25 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs leading-6">At this size, exact entropy is calculated for the strongest {RANKING_CONFIG.shortlistSize} letter-quality/commonness candidates. This keeps the browser responsive while the same weighted ranking decides the winner.</p>
        </div>
      )}
    </div>
  );
}

function RouteOverview({ walkthrough }) {
  const nodes = [
    { count: words.length, label: "No clues" },
    ...walkthrough.rounds.map((round) => ({
      count: round.after,
      label: `After ${round.guess.toUpperCase()}`,
    })),
  ];

  return (
    <section className="mb-10">
      <div className="mb-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-primary">The route for {walkthrough.hiddenWord.toUpperCase()}</p>
        <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
          {walkthrough.guessesToSolve} {walkthrough.guessesToSolve === 1 ? "guess" : "guesses"}, with the reasoning left visible
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {nodes.map(({ count, label }, index) => (
          <div className="contents" key={`${label}-${index}`}>
            <div className="min-w-28 flex-1 rounded-xl border border-border bg-muted/25 p-3 text-center">
              <strong className="font-mono text-lg text-foreground">{count.toLocaleString()}</strong>
              <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
            </div>
            {index < nodes.length - 1 && <ArrowRight className="size-4 shrink-0 text-primary" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function FeedbackStep({ index, rounds, walkthrough }) {
  const round = rounds[index];
  const nextRound = rounds[index + 1];
  const solvedByGuess = round.guess === walkthrough.hiddenWord;

  return (
    <ArticleStep
      eyebrow={`Play ${round.guess.toUpperCase()}`}
      number={index + 2}
      title={solvedByGuess
        ? `${round.guess.toUpperCase()} is the answer`
        : `The colors reduce ${round.before.toLocaleString()} possibilities to ${round.after.toLocaleString()}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <FeedbackTiles states={round.states} word={round.guess} />
        <div className="flex flex-col items-start gap-1 sm:items-end"><PatternCode compact pattern={round.pattern} word={round.guess} /><span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Pattern {round.pattern}</span></div>
      </div>

      <p>
        Wordle compares <strong className="uppercase text-foreground">{round.guess}</strong> with the hidden answer <strong className="uppercase text-foreground">{walkthrough.hiddenWord}</strong>. The solver encodes gray as 0, yellow as 1, and green as 2, producing <code>{round.pattern}</code>.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...round.guess].map((letter, position) => (
          <Condition
            guess={round.guess}
            key={`${round.guess}-${position}`}
            letter={letter}
            position={position}
            state={round.states[position]}
          />
        ))}
      </div>

      {solvedByGuess ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary/20 bg-primary/[0.06] p-6 text-center">
          <Badge className="border-primary/20 bg-primary/10 text-primary" variant="outline"><Check data-icon="inline-start" /> Solved directly</Badge>
          <p className="text-xs text-muted-foreground">Every tile is green, so no further filtering or ranking is needed.</p>
        </div>
      ) : (
        <>
          <p>The solver replays this guess against every current candidate and keeps a word only when it generates the exact same pattern. Matching the complete pattern automatically handles positions and repeated-letter limits.</p>

          <Formula label="How each new row removes impossible answers">
            <div className="space-y-4">
              <MathSection title="What is being calculated">
                A candidate survives only if it would have produced exactly the same colors Wordle returned for every guess already played.
              </MathSection>
              <MathSection title="The filtering rule">
                next candidates = current candidates where:<br />
                simulated pattern(candidate, latest guess) = observed Wordle pattern
              </MathSection>
              <MathSection title="What each part means">
                current candidates = words that fit every earlier row<br />
                simulated pattern = colors this candidate would produce<br />
                observed pattern = colors copied from the real Wordle game<br />
                An exact pattern comparison handles correct positions, misplaced letters, and duplicate counts together.
              </MathSection>
              <MathSection title="Use all feedback received in this example">
                <span className="block">Start: {words.length.toLocaleString()} ESDB candidates</span>
                {rounds.slice(0, index + 1).map((observation, observationIndex) => (
                  <span className="block" key={observation.guess}>
                    After row {observationIndex + 1}: pattern(candidate, {observation.guess.toUpperCase()}) must equal {patternWithLetters(observation.guess, observation.pattern)} → {observation.after.toLocaleString()} remain
                  </span>
                ))}
              </MathSection>
            </div>
          </Formula>

          <CandidateTransition round={round} />

          {nextRound ? (
            <>
              <Separator />
              <div>
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-primary">Rerank from scratch</p>
                <h3 className="font-heading text-lg font-semibold text-foreground">{nextRound.guess.toUpperCase()} is now the best question</h3>
              </div>
              <ScoreExplanation round={nextRound} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary/20 bg-primary/[0.06] p-6 text-center">
              <Badge className="border-primary/20 bg-primary/10 text-primary" variant="outline"><Check data-icon="inline-start" /> One candidate remains</Badge>
              <FeedbackTiles states={["correct", "correct", "correct", "correct", "correct"]} word={walkthrough.finalWord} />
              <div>
                <strong className="font-heading text-xl uppercase text-foreground">{walkthrough.finalWord} is the final guess.</strong>
                <p className="mt-1 text-xs text-muted-foreground">With no uncertainty left, the solver returns it directly with score 100.</p>
              </div>
            </div>
          )}
        </>
      )}
    </ArticleStep>
  );
}

function Walkthrough({ walkthrough }) {
  const firstRound = walkthrough.rounds[0];

  return (
    <>
      <RouteOverview walkthrough={walkthrough} />

      <div className="space-y-5 sm:space-y-7">
        <ArticleStep number={1} eyebrow="No clues" title={`Why does ${firstRound.guess.toUpperCase()} rank first?`}>
          <ScoreExplanation hiddenWord={walkthrough.hiddenWord} opening round={firstRound} />
          <div className="flex gap-3 rounded-xl border border-border bg-muted/25 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-xs leading-6">The displayed score is relative within this round: the best raw score maps to 100 and the worst to 70. It is <strong className="text-foreground">not</strong> the probability that the guess is correct.</p>
          </div>
        </ArticleStep>

        {walkthrough.rounds.map((round, index) => (
          <FeedbackStep
            index={index}
            key={`${walkthrough.hiddenWord}-${round.guess}`}
            rounds={walkthrough.rounds}
            walkthrough={walkthrough}
          />
        ))}
      </div>
    </>
  );
}

export function ScoringGuide({ onBack }) {
  const [draft, setDraft] = useState(DEFAULT_WORD.toUpperCase());
  const [hiddenWord, setHiddenWord] = useState(DEFAULT_WORD);
  const [validationError, setValidationError] = useState("");
  const [result, setResult] = useState({
    hiddenWord: null,
    walkthrough: null,
    error: null,
  });

  const normalizedDraft = useMemo(
    () => draft.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5),
    [draft],
  );
  const isLoading = result.hiddenWord !== hiddenWord;

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer;
    setResult({ hiddenWord: null, walkthrough: null, error: null });

    const finishWithFallback = () => {
      fallbackTimer = window.setTimeout(() => {
        if (cancelled) return;
        try {
          setResult({
            hiddenWord,
            walkthrough: buildScoringWalkthrough(hiddenWord, words, wordCommonness),
            error: null,
          });
        } catch (error) {
          setResult({
            hiddenWord,
            walkthrough: null,
            error: error instanceof Error ? error.message : "Unable to calculate this path.",
          });
        }
      }, 0);
    };

    if (typeof Worker === "undefined") {
      finishWithFallback();
      return () => {
        cancelled = true;
        window.clearTimeout(fallbackTimer);
      };
    }

    const worker = new Worker(new URL("../lib/scoring-walkthrough.worker.js", import.meta.url), {
      type: "module",
    });

    worker.onmessage = ({ data }) => {
      if (!cancelled && data.hiddenWord === hiddenWord) setResult(data);
      worker.terminate();
    };
    worker.onerror = () => {
      worker.terminate();
      finishWithFallback();
    };
    worker.postMessage({ hiddenWord });

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      worker.terminate();
    };
  }, [hiddenWord]);

  const chooseWord = (event) => {
    event.preventDefault();

    if (normalizedDraft.length !== 5) {
      setValidationError("Enter exactly five letters.");
      return;
    }
    if (!wordSet.has(normalizedDraft)) {
      setValidationError(`${normalizedDraft.toUpperCase()} is not in the current ESDB word set.`);
      return;
    }

    setValidationError("");
    if (normalizedDraft === hiddenWord) {
      setDraft(normalizedDraft.toUpperCase());
      return;
    }
    setDraft(normalizedDraft.toUpperCase());
    setHiddenWord(normalizedDraft);
  };

  return (
    <main className="scoring-guide relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <article>
        <header className="mb-8 border-b border-border pb-8 sm:mb-10 sm:pb-10">
          <Button className="mb-6 -ml-2" onClick={onBack} variant="ghost">
            <ArrowLeft data-icon="inline-start" /> Back to solver
          </Button>
          <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary" variant="outline">
            <BookOpen data-icon="inline-start" /> Guided worked example
          </Badge>
          <h1 className="max-w-4xl font-heading text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
            How does the solver decide<br />what to guess next?
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Choose a hidden word and follow the production algorithm through every recommendation. At each round, the page shows what the solver knows, what it calculates, why one word outranks another, and how the returned colors change the next decision.
          </p>

          <form className="mt-7 rounded-2xl border border-border bg-card/70 p-5 sm:p-6" onSubmit={chooseWord}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full max-w-sm">
                <label className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground" htmlFor="walkthrough-word">Choose the hidden word</label>
                <Input
                  aria-describedby={validationError ? "walkthrough-word-error" : "walkthrough-word-help"}
                  aria-invalid={Boolean(validationError)}
                  autoComplete="off"
                  className="mt-2 h-12 font-mono text-lg font-bold uppercase tracking-[0.22em]"
                  id="walkthrough-word"
                  inputMode="text"
                  maxLength={5}
                  onChange={(event) => {
                    setDraft(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5));
                    setValidationError("");
                  }}
                  spellCheck={false}
                  value={draft}
                />
                {validationError ? (
                  <p className="mt-2 text-xs text-destructive" id="walkthrough-word-error">{validationError}</p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground" id="walkthrough-word-help">Any five-letter word in the current ESDB dictionary.</p>
                )}
              </div>
              <Button disabled={isLoading} size="lg" type="submit">
                {isLoading ? <><LoaderCircle className="animate-spin" data-icon="inline-start" /> Calculating path</> : <>Follow this word <ArrowRight data-icon="inline-end" /></>}
              </Button>
            </div>
            <p className="mt-4 max-w-2xl text-xs leading-6 text-muted-foreground">The ranking algorithm remains blind to the selected answer. Choosing a hidden word supplies only the feedback needed to demonstrate how each new clue changes the next recommendation.</p>
          </form>
        </header>

        {isLoading && (
          <Card className="mb-10 border-primary/15 bg-primary/[0.04]">
            <CardContent className="flex min-h-44 flex-col items-center justify-center gap-4 text-center">
              <LoaderCircle className="size-6 animate-spin text-primary" />
              <div><p className="font-medium text-foreground">Calculating the route to {hiddenWord.toUpperCase()}</p><p className="mt-1 text-xs text-muted-foreground">Testing feedback partitions across {words.length.toLocaleString()} words…</p></div>
            </CardContent>
          </Card>
        )}

        {!isLoading && result.error && (
          <Card className="mb-10 border-destructive/30">
            <CardContent className="py-6 text-sm text-destructive">{result.error}</CardContent>
          </Card>
        )}

        {!isLoading && result.walkthrough && <Walkthrough walkthrough={result.walkthrough} />}

        <section className="mt-10 grid gap-4 lg:grid-cols-2">
          <Card className="border-border bg-card/80">
            <CardHeader>
              <Sparkles className="mb-2 size-5 text-primary" />
              <CardTitle className="font-heading text-xl">The algorithm repeated every round</CardTitle>
              <CardDescription>The words and numbers change, but the procedure does not.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {[
                  ["Filter", "Replay every observation and keep exact feedback matches."],
                  ["Model letters", "Recount positional frequency and unique-letter coverage in the survivors."],
                  ["Shortlist", `Above ${RANKING_CONFIG.shortlistThreshold} candidates, select the strongest ${RANKING_CONFIG.shortlistSize} coverage/commonness options for exact entropy evaluation.`],
                  ["Partition", "Simulate each evaluated guess against every possible answer and build feedback buckets."],
                  ["Rank", "Combine 82% normalized entropy, 6% letter quality, and 12% ESDB commonness."],
                  ["Repeat", "Use the real colors to define a smaller problem and calculate everything again."],
                ].map(([title, description], index) => (
                  <li className="grid grid-cols-[28px_1fr] gap-3" key={title}>
                    <span className="grid size-7 place-items-center rounded-lg bg-primary/10 font-mono text-[9px] font-bold text-primary">{index + 1}</span>
                    <p className="text-xs leading-5 text-muted-foreground"><strong className="text-foreground">{title}.</strong> {description}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/80">
            <CardHeader>
              <Database className="mb-2 size-5 text-primary" />
              <CardTitle className="font-heading text-xl">What every path is based on</CardTitle>
              <CardDescription>One reproducible vocabulary and one deterministic algorithm.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs leading-6 text-muted-foreground">
              <p>Every candidate count is calculated live from the pinned English Speller Database build.</p>
              <Formula label="Pinned dictionary configuration">
                {WORD_SOURCE.wordCount.toLocaleString()} words · ESDB {WORD_SOURCE.ref}<br />
                size {WORD_SOURCE.size} · spellings {WORD_SOURCE.spellings} · variant level {WORD_SOURCE.variantLevel}<br />
                commit {WORD_SOURCE.commit.slice(0, 16)}…
              </Formula>
              <p>This is explainable information theory, not a neural network. The same dictionary, hidden word, and algorithm always produce the same route.</p>
            </CardContent>
          </Card>
        </section>

        <footer className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-8 text-center">
          <Sigma className="size-5 text-primary" />
          <p className="max-w-xl text-xs leading-6 text-muted-foreground">Ready to use the same process on your own Wordle colors?</p>
          <Button onClick={onBack} size="lg">Return to the solver <ArrowRight data-icon="inline-end" /></Button>
        </footer>
      </article>
    </main>
  );
}
