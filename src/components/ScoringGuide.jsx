import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Binary,
  Calculator,
  Database,
  FlaskConical,
  Info,
  LoaderCircle,
  Play,
  RotateCcw,
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
import { Skeleton } from "@/components/ui/skeleton";
import words, { WORD_SOURCE } from "@/data/words";
import {
  analyzeGuess,
  filterCandidates,
  patternKey,
  RANKING_CONFIG,
  scoreGuess,
} from "@/lib/solver";
import { useRankedCandidates } from "@/lib/use-ranked-candidates";
import { cn } from "@/lib/utils";

const dictionary = new Set(words);
const noCandidates = [];
const stateDigit = { absent: "0", present: "1", correct: "2" };
const digitState = { 0: "absent", 1: "present", 2: "correct" };
const stateLabel = {
  absent: "Gray — absent",
  present: "Yellow — present elsewhere",
  correct: "Green — correct position",
};

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function Formula({ children }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-muted/35 px-4 py-3 font-mono text-[11px] leading-6 text-foreground sm:text-xs">
      {children}
    </div>
  );
}

function FeedbackTiles({ word, states, compact = false }) {
  return (
    <div className={cn("flex", compact ? "gap-1" : "gap-1.5")}>
      {[...word].map((letter, index) => (
        <span
          aria-label={`${letter}, ${stateLabel[states[index]]}`}
          className={cn(
            "grid place-items-center rounded-md font-mono font-bold uppercase text-white",
            compact ? "size-6 text-[9px]" : "size-10 text-sm sm:size-11",
            states[index] === "absent" && "bg-wordle-absent",
            states[index] === "present" && "bg-wordle-present",
            states[index] === "correct" && "bg-wordle-correct",
          )}
          key={`${letter}-${index}`}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

function PatternTiles({ pattern }) {
  const states = [...pattern].map((digit) => digitState[digit]);
  return (
    <div aria-label={`Feedback pattern ${pattern}`} className="flex gap-0.5">
      {states.map((state, index) => (
        <i
          className={cn(
            "size-2.5 rounded-[3px]",
            state === "absent" && "bg-wordle-absent",
            state === "present" && "bg-wordle-present",
            state === "correct" && "bg-wordle-correct",
          )}
          key={`${state}-${index}`}
        />
      ))}
    </div>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-border bg-muted/25 p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <strong className="mt-2 block font-mono text-xl tracking-tight">{value}</strong>
      {detail && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Step({ number, title, children }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-card/65 p-4 sm:grid-cols-[42px_1fr] sm:p-5">
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 font-mono text-xs font-bold text-primary">0{number}</span>
      <div>
        <h3 className="font-heading text-base font-semibold tracking-tight">{title}</h3>
        <div className="mt-2 space-y-3 text-xs leading-6 text-muted-foreground sm:text-sm">{children}</div>
      </div>
    </div>
  );
}

export function ScoringGuide({ initialRanked, initialIsRanking, onBack }) {
  const [answer, setAnswer] = useState("plant");
  const [guess, setGuess] = useState("rates");
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  const candidates = useMemo(
    () => filterCandidates(words, history),
    [history],
  );
  const needsDemoRanking = history.length > 0 && candidates.length > 0;
  const demoRanking = useRankedCandidates(
    needsDemoRanking ? candidates : noCandidates,
  );
  const ranked = history.length > 0 ? demoRanking.ranked : initialRanked;
  const isRanking = history.length > 0
    ? demoRanking.isRanking
    : initialIsRanking;
  const recommendation = ranked[0];
  const validTypedGuess = guess.length === 5 && dictionary.has(guess);
  const analysisWord = validTypedGuess ? guess : recommendation?.word || "";
  const analysis = useMemo(
    () => analyzeGuess(analysisWord, candidates),
    [analysisWord, candidates],
  );
  const scoreDetail = ranked.find(({ word }) => word === analysisWord);
  const solved = history.at(-1)?.word === answer;

  const changeAnswer = (value) => {
    setAnswer(value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5));
    setGuess("rates");
    setHistory([]);
    setError("");
  };

  const changeGuess = (value) => {
    setGuess(value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5));
    setError("");
  };

  const runGuess = () => {
    if (!dictionary.has(answer)) {
      setError("Choose a five-letter answer from the ESDB dictionary.");
      return;
    }
    if (!dictionary.has(guess)) {
      setError("Choose a five-letter guess from the ESDB dictionary.");
      return;
    }
    if (!candidates.includes(answer)) {
      setError("That answer conflicts with the existing walkthrough. Reset and try again.");
      return;
    }

    const states = scoreGuess(answer, guess);
    const nextHistory = [...history, { word: guess, states }];
    const afterCount = filterCandidates(words, nextHistory).length;
    setHistory((current) => [
      ...current,
      {
        word: guess,
        states,
        beforeCount: candidates.length,
        afterCount,
      },
    ]);
    setGuess("");
    setError("");
  };

  const reset = () => {
    setAnswer("plant");
    setGuess("rates");
    setHistory([]);
    setError("");
  };

  const entropyContribution = scoreDetail?.evaluated
    ? scoreDetail.normalizedEntropy * RANKING_CONFIG.entropyWeight
    : null;
  const frequencyContribution = scoreDetail
    ? scoreDetail.normalizedFrequency * RANKING_CONFIG.frequencyWeight
    : null;
  const commonnessContribution = scoreDetail
    ? scoreDetail.normalizedCommonness * RANKING_CONFIG.commonnessWeight
    : null;
  const largestBucket = analysis.buckets[0]?.size || 1;

  return (
    <main className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <section className="mb-6 flex flex-col gap-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button className="mb-5 -ml-2" onClick={onBack} variant="ghost">
            <ArrowLeft data-icon="inline-start" /> Back to solver
          </Button>
          <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary" variant="outline">
            <FlaskConical data-icon="inline-start" /> Interactive scoring lab
          </Badge>
          <h1 className="max-w-3xl font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
            See every recommendation<br />become a number.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Choose a hidden answer, play guesses, and inspect the exact feedback buckets, entropy, frequency, and commonness values used by the production solver.
        </p>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
        <Card className="gap-0 border-border bg-card/80 py-0 shadow-[0_20px_70px_rgba(0,0,0,.12)]">
          <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge className="font-mono text-[9px] uppercase tracking-wider" variant="secondary">{candidates.length.toLocaleString()} candidates</Badge>
                <Badge className="font-mono text-[9px] uppercase tracking-wider" variant="outline">{history.length} observations</Badge>
                {isRanking && <Badge className="text-primary" variant="outline"><LoaderCircle className="animate-spin" data-icon="inline-start" /> Ranking</Badge>}
              </div>
              <CardTitle className="font-heading text-xl">Walk through a real solve</CardTitle>
              <CardDescription className="mt-1">The answer is visible because this is a learning environment. The normal solver never knows it.</CardDescription>
            </div>
            <Button onClick={reset} variant="outline"><RotateCcw data-icon="inline-start" /> Reset lab</Button>
          </CardHeader>

          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">Hidden answer</span>
                <Input
                  aria-label="Hidden answer for scoring walkthrough"
                  className="h-11 font-mono uppercase tracking-[0.18em]"
                  disabled={history.length > 0}
                  maxLength={5}
                  onChange={(event) => changeAnswer(event.target.value)}
                  value={answer}
                />
              </label>
              <label className="space-y-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">Next guess to test</span>
                <Input
                  aria-label="Guess for scoring walkthrough"
                  className="h-11 font-mono uppercase tracking-[0.18em]"
                  disabled={solved}
                  maxLength={5}
                  onChange={(event) => changeGuess(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && runGuess()}
                  placeholder={recommendation?.word || "word"}
                  value={guess}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={solved || isRanking && !guess} onClick={runGuess}>
                <Play data-icon="inline-start" /> Calculate feedback
              </Button>
              {recommendation && !solved && (
                <Button onClick={() => setGuess(recommendation.word)} variant="outline">
                  Use #{1} {recommendation.word.toUpperCase()}
                </Button>
              )}
              <span aria-live="polite" className="text-xs text-destructive">{error}</span>
            </div>

            {history.length > 0 && (
              <div className="space-y-3">
                <Separator />
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">Observed evidence</p>
                  <span className="text-[10px] text-muted-foreground">0 gray · 1 yellow · 2 green</span>
                </div>
                {history.map((entry, index) => {
                  const reduction = entry.beforeCount
                    ? 1 - entry.afterCount / entry.beforeCount
                    : 0;
                  return (
                    <div className="grid items-center gap-3 rounded-xl border border-border bg-muted/25 p-3 sm:grid-cols-[auto_1fr_auto]" key={`${entry.word}-${index}`}>
                      <FeedbackTiles states={entry.states} word={entry.word} />
                      <div>
                        <p className="font-mono text-[10px] text-muted-foreground">Pattern {patternKey(entry.states)}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: percent(reduction) }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <strong className="font-mono text-xs">{entry.beforeCount.toLocaleString()} → {entry.afterCount.toLocaleString()}</strong>
                        <p className="mt-1 text-[9px] text-muted-foreground">{percent(reduction)} removed</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {solved && (
              <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.07] p-4">
                <Sparkles className="size-5 text-primary" />
                <div><strong>Solved in {history.length} guesses.</strong><p className="text-xs text-muted-foreground">Every tile is green and only one candidate remains.</p></div>
              </div>
            )}

            <Separator />

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-primary">Current ranking</p>
                  <h2 className="mt-1 font-heading text-lg font-semibold">What the solver would try next</h2>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">score / bits</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-5">
                {isRanking
                  ? Array.from({ length: 5 }, (_, index) => <Skeleton className="h-20 bg-muted" key={index} />)
                  : ranked.slice(0, 5).map((candidate, index) => (
                    <button
                      className={cn(
                        "rounded-xl border border-border bg-muted/25 p-3 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.04]",
                        guess === candidate.word && "border-primary/40 bg-primary/[0.06]",
                      )}
                      key={candidate.word}
                      onClick={() => setGuess(candidate.word)}
                      type="button"
                    >
                      <span className="font-mono text-[8px] text-muted-foreground">#{index + 1}</span>
                      <strong className="mt-2 block font-mono text-sm uppercase tracking-[0.12em]">{candidate.word}</strong>
                      <span className="mt-2 flex justify-between font-mono text-[9px] text-muted-foreground"><i className="not-italic">{candidate.score}</i><i className="not-italic">{candidate.entropy?.toFixed(2) ?? "—"}b</i></span>
                    </button>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:sticky xl:top-20">
          <Card className="gap-0 border-border bg-card/80 py-0">
            <CardHeader className="border-b border-border px-5 py-5">
              <div>
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.13em] text-primary">Entropy explorer</p>
                <CardTitle className="font-mono text-2xl uppercase tracking-[0.14em]">{analysisWord || "Waiting"}</CardTitle>
                <CardDescription className="mt-1">Every possible answer is grouped by the colors this guess would return.</CardDescription>
              </div>
              <BarChart3 className="size-5 text-primary" />
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Information" value={`${analysis.entropy.toFixed(3)} bits`} detail="Shannon entropy" />
                <Metric label="Patterns" value={analysis.patternCount.toLocaleString()} detail="Distinct outcomes" />
                <Metric label="Expected left" value={analysis.expectedRemaining.toFixed(1)} detail="Average next set" />
                <Metric label="Worst bucket" value={analysis.worstCase.toLocaleString()} detail="Largest outcome" />
              </div>

              <Formula>
                H({analysisWord.toUpperCase() || "GUESS"}) = −Σ p(pattern) × log₂ p(pattern) = {analysis.entropy.toFixed(4)} bits
              </Formula>

              <div>
                <div className="mb-2 flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted-foreground"><span>Largest feedback buckets</span><span>Words</span></div>
                <div className="space-y-2">
                  {analysis.buckets.slice(0, 8).map(({ pattern, size, probability }) => (
                    <div className="grid grid-cols-[54px_1fr_44px] items-center gap-2" key={pattern}>
                      <PatternTiles pattern={pattern} />
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, size / largestBucket * 100)}%` }} />
                      </div>
                      <span className="text-right font-mono text-[9px] text-muted-foreground">{size} · {(probability * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 border-border bg-card/80 py-0">
            <CardHeader className="border-b border-border px-5 py-5">
              <div>
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.13em] text-primary">Score anatomy</p>
                <CardTitle className="font-heading text-lg">Three weighted signals</CardTitle>
              </div>
              <Calculator className="size-5 text-primary" />
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {scoreDetail?.evaluated ? (
                <>
                  {[
                    ["Information gain", scoreDetail.normalizedEntropy, RANKING_CONFIG.entropyWeight, entropyContribution],
                    ["Letter quality", scoreDetail.normalizedFrequency, RANKING_CONFIG.frequencyWeight, frequencyContribution],
                    ["Commonness", scoreDetail.normalizedCommonness, RANKING_CONFIG.commonnessWeight, commonnessContribution],
                  ].map(([label, normalized, weight, contribution]) => (
                    <div className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-border p-3" key={label}>
                      <div>
                        <div className="flex justify-between text-[10px]"><span>{label}</span><span className="font-mono text-muted-foreground">{normalized.toFixed(4)} × {weight}</span></div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: percent(normalized) }} /></div>
                      </div>
                      <strong className="self-center font-mono text-xs">{contribution.toFixed(4)}</strong>
                    </div>
                  ))}
                  <Formula>
                    raw = {entropyContribution.toFixed(4)} + {frequencyContribution.toFixed(4)} + {commonnessContribution.toFixed(4)} = {scoreDetail.rawScore.toFixed(4)}
                  </Formula>
                  <div className="flex items-center justify-between rounded-xl bg-primary/[0.07] px-4 py-3"><span className="text-xs text-muted-foreground">Relative smart score</span><strong className="font-mono text-2xl text-primary">{scoreDetail.score}</strong></div>
                </>
              ) : scoreDetail ? (
                <div className="rounded-xl border border-border bg-muted/25 p-4 text-xs leading-5 text-muted-foreground">
                  This word is outside the {RANKING_CONFIG.shortlistSize}-word entropy shortlist, so its temporary rank uses the faster coverage/commonness heuristic. It receives exact entropy once {RANKING_CONFIG.shortlistThreshold} or fewer candidates remain.
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/25 p-4 text-xs leading-5 text-muted-foreground">Choose a ranked candidate to inspect its weighted score.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-5 max-w-2xl">
          <Badge className="mb-3" variant="secondary"><Sigma data-icon="inline-start" /> The mathematics</Badge>
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">From colored tiles to a ranked decision</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">The interactive values above pass through these exact stages. Nothing here is generated by an opaque model.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Step number={1} title="Reproduce Wordle feedback exactly">
            <p>Green matches are marked first. Only then are remaining answer letters counted for yellow matches. This two-pass rule prevents duplicate letters from receiving too many yellows.</p>
            <Formula>pattern(answer, guess) ∈ {`{0, 1, 2}`}⁵</Formula>
            <div className="flex flex-wrap items-center gap-3">
              <FeedbackTiles states={["correct", "present", "absent", "present", "absent"]} word="alley" />
              <span className="font-mono text-[10px] text-muted-foreground">against APPLE → 21010</span>
            </div>
          </Step>

          <Step number={2} title="Keep only compatible answers">
            <p>For every candidate, the solver replays every previous guess. A word survives only when its calculated five-tile pattern equals the pattern entered by the player.</p>
            <Formula>keep answer a ⇔ ∀ guess g: pattern(a, g) = observed(g)</Formula>
            <p>This automatically handles required letters, forbidden positions, absent letters, and duplicate counts without a fragile collection of special rules.</p>
          </Step>

          <Step number={3} title="Estimate letter quality">
            <p>We count how often letters appear in each position and how many candidate words contain each unique letter. Repeated letters receive a small exploratory penalty.</p>
            <Formula>
              F(w) = positionValue/(5N) + coverageValue/(5N) − 0.035 × duplicates
            </Formula>
            <p>The raw values are min-max normalized: F′ = (F − Fmin) / (Fmax − Fmin).</p>
          </Step>

          <Step number={4} title="Measure expected information">
            <p>A guess partitions the candidate set into feedback buckets. If bucket j contains nⱼ answers, its probability is pⱼ = nⱼ/N.</p>
            <Formula>H(g) = −Σ pⱼ log₂(pⱼ)</Formula>
            <p>More evenly distributed buckets produce more bits. One bit is roughly a two-way split; two bits roughly four useful groups; three bits roughly eight.</p>
          </Step>

          <Step number={5} title="Add one-source commonness">
            <p>ESDB's size tiers provide a restrained familiarity signal. Tier 35 maps to 1.00, while tier 80 maps to 0.15. Lower tiers contain the more established vocabulary.</p>
            <Formula>C(tier) = 1.00, 0.92, 0.78, 0.62, 0.50, 0.35, or 0.15</Formula>
            <p>Commonness does not override information gain; it mainly keeps obscure but similarly informative words from crowding familiar guesses.</p>
          </Step>

          <Step number={6} title="Combine and present the result">
            <p>Entropy is normalized by log₂(N), then combined with normalized frequency and commonness.</p>
            <Formula>raw = 0.82H′ + 0.06F′ + 0.12C</Formula>
            <p>Finally, raw scores are rescaled between 70 and 100 for readability. The displayed value is relative within the current round—not a probability that the word is correct.</p>
          </Step>
        </div>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="border-border bg-card/80">
          <CardHeader>
            <Database className="mb-2 size-5 text-primary" />
            <CardTitle className="font-heading text-xl">One vocabulary source</CardTitle>
            <CardDescription>No historical Wordle list and no supplemental union.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>The candidate universe is generated solely from the pinned English Speller Database release. The updater verifies the exact upstream commit before producing the checked-in module.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Words" value={WORD_SOURCE.wordCount.toLocaleString()} />
              <Metric label="ESDB size" value={WORD_SOURCE.size} />
              <Metric label="Spellings" value={WORD_SOURCE.spellings} />
              <Metric label="Variants" value={WORD_SOURCE.variantLevel} />
            </div>
            <Formula>{WORD_SOURCE.ref} · {WORD_SOURCE.commit.slice(0, 12)} · lowercase · five letters · deaccented · no abbreviations</Formula>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/80">
          <CardHeader>
            <Binary className="mb-2 size-5 text-primary" />
            <CardTitle className="font-heading text-xl">What the score is not</CardTitle>
            <CardDescription>Important boundaries for interpreting the number honestly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            {[
              ["Not answer probability", "A score of 97 does not mean a 97% chance of being correct."],
              ["Not comparable across rounds", "Each round has different candidates, minima, and maxima."],
              ["Not a neural network", "This is deterministic information theory plus explicit, inspectable heuristics."],
              ["Not exhaustive above 420", `Large sets entropy-test the strongest ${RANKING_CONFIG.shortlistSize} heuristic candidates to keep the browser responsive.`],
            ].map(([title, description]) => (
              <div className="flex gap-3 rounded-xl border border-border bg-muted/25 p-3" key={title}>
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                <p><strong className="text-foreground">{title}.</strong> {description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <div className="mt-8 flex justify-center">
        <Button onClick={onBack} size="lg">Return to the solver <ArrowRight data-icon="inline-end" /></Button>
      </div>
    </main>
  );
}
