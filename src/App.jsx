import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Delete,
  Info,
  ListFilter,
  LoaderCircle,
  Moon,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Undo2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import words, { WORD_SOURCE, wordCommonness } from "./data/words";
import {
  cycleTileState,
  filterCandidates,
  keyboardStates,
  rankCandidates,
} from "./lib/solver";

const MAX_GUESSES = 6;
const emptyStates = () => Array(5).fill("absent");
const keyboardRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const brandFrames = [
  { word: "WORDLE", states: ["absent", "correct", "present", "absent", "present", "present"] },
  { word: "SOLVER", states: Array(6).fill("correct") },
];

function commonnessLabel(tier) {
  if (tier <= 40) return "common";
  if (tier <= 50) return "familiar";
  if (tier <= 60) return "standard";
  if (tier <= 70) return "uncommon";
  if (tier <= 80) return "rare";
  return "extended";
}

function useRankedCandidates(candidates) {
  const [result, setResult] = useState({ source: null, ranked: [] });

  useEffect(() => {
    if (!candidates.length) return undefined;

    let cancelled = false;
    let fallbackTimer;

    if (typeof Worker === "undefined") {
      fallbackTimer = window.setTimeout(() => {
        if (!cancelled) setResult({ source: candidates, ranked: rankCandidates(candidates, wordCommonness) });
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(fallbackTimer);
      };
    }

    const worker = new Worker(new URL("./lib/rank.worker.js", import.meta.url), {
      type: "module",
    });

    worker.onmessage = ({ data }) => {
      if (!cancelled) setResult({ source: candidates, ranked: data });
      worker.terminate();
    };
    worker.onerror = () => {
      if (!cancelled) setResult({ source: candidates, ranked: rankCandidates(candidates, wordCommonness) });
      worker.terminate();
    };
    worker.postMessage({
      candidates,
      commonness: candidates.map((word) => wordCommonness.get(word) ?? 90),
    });

    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, [candidates]);

  if (!candidates.length) return { ranked: [], isRanking: false };
  const isReady = result.source === candidates;
  return { ranked: isReady ? result.ranked : [], isRanking: !isReady };
}

function AnimatedBrand() {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % brandFrames.length);
    }, 4200);
    return () => window.clearInterval(interval);
  }, []);

  const frame = brandFrames[frameIndex];

  return (
    <span className="flex gap-1" title="Wordle Solver">
      <span className="sr-only">Wordle Solver</span>
      {[...frame.word].map((letter, index) => (
        <span
          aria-hidden="true"
          className={`brand-tile brand-tile--${frame.states[index]}`}
          key={`${frame.word}-${index}`}
          style={{ "--brand-delay": `${index * 85}ms` }}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

function IconButton({ label, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} size="icon" variant="outline" {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}

function Tile({ letter, state, ghost, active, loading, onClick, index }) {
  if (loading) {
    return <Skeleton className="aspect-square rounded-xl bg-muted" />;
  }

  const nextState = state ? cycleTileState(state) : "absent";
  const label = ghost
    ? `${letter}, suggested letter. Accept this suggestion to set its colors.`
    : active && letter
      ? `${letter}, ${state}. Click to mark ${nextState}.`
      : letter || "Empty tile";

  return (
    <button
      aria-label={label}
      className={cn(
        "word-tile",
        state && `word-tile--${state}`,
        ghost && "word-tile--ghost",
        active && letter && "word-tile--interactive",
      )}
      disabled={!onClick}
      onClick={onClick}
      style={{ "--tile-delay": `${index * 45}ms` }}
      type="button"
    >
      {letter}
    </button>
  );
}

function GuessRow({ guess, active, suggestion, loading, onCycle, onUseSuggestion }) {
  const displayWord = guess?.word || suggestion || "";
  const isGhost = active && !guess?.word && Boolean(suggestion);

  return (
    <div className="grid grid-cols-5 gap-2">
      {Array.from({ length: 5 }, (_, index) => (
        <Tile
          active={active}
          ghost={isGhost}
          index={index}
          key={index}
          letter={displayWord[index] || ""}
          loading={active && loading && !displayWord}
          onClick={
            active && displayWord[index]
              ? isGhost
                ? onUseSuggestion
                : () => onCycle(index)
              : undefined
          }
          state={guess?.word?.[index] ? guess.states[index] : undefined}
        />
      ))}
    </div>
  );
}

function Board({ history, draft, draftStates, suggestion, solved, isRanking, onCycle, onUseSuggestion }) {
  const activeIndex = solved ? -1 : Math.min(history.length, MAX_GUESSES - 1);

  return (
    <div aria-label="Wordle guesses" className="mx-auto grid w-full max-w-[328px] gap-2" role="group">
      {Array.from({ length: MAX_GUESSES }, (_, index) => {
        const savedGuess = history[index];
        const isActive = index === activeIndex && history.length < MAX_GUESSES;
        const guess = savedGuess || (isActive && draft ? { word: draft, states: draftStates } : null);
        return (
          <GuessRow
            active={isActive}
            guess={guess}
            key={index}
            loading={isActive && isRanking && !draft}
            onCycle={onCycle}
            onUseSuggestion={onUseSuggestion}
            suggestion={isActive && !draft ? suggestion : ""}
          />
        );
      })}
    </div>
  );
}

function Keyboard({ states, onKey }) {
  return (
    <div aria-label="On-screen keyboard" className="mx-auto grid w-full max-w-[540px] gap-1.5">
      {keyboardRows.map((row, rowIndex) => (
        <div className="flex justify-center gap-1.5" key={row}>
          {rowIndex === 2 && (
            <Button className="h-11 min-w-14 flex-[1.5] rounded-lg px-1 text-[10px] font-bold uppercase sm:min-w-16" onClick={() => onKey("ENTER")} variant="secondary">
              Enter
            </Button>
          )}
          {[...row].map((letter) => (
            <Button
              aria-label={`${letter}${states[letter] ? `, ${states[letter]}` : ""}`}
              className={cn("key-button h-11 min-w-0 flex-1 rounded-lg px-0 font-mono text-xs uppercase", states[letter] && `key-button--${states[letter]}`)}
              key={letter}
              onClick={() => onKey(letter)}
              variant="secondary"
            >
              {letter}
            </Button>
          ))}
          {rowIndex === 2 && (
            <Button aria-label="Backspace" className="h-11 min-w-14 flex-[1.5] rounded-lg px-1 sm:min-w-16" onClick={() => onKey("BACKSPACE")} variant="secondary">
              <Delete className="size-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function CandidateDrawer({ candidates, open, onOpenChange, onChoose }) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(180);
  const queryValue = query.trim().toLowerCase();
  const filtered = candidates
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
    .filter(({ word }) => word.includes(queryValue));
  const visible = filtered.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(180);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setVisibleCount(180);
    }
  }, [open]);

  return (
    <Drawer direction="right" onOpenChange={onOpenChange} open={open}>
      <DrawerContent className="h-full w-[92vw]! border-l-border bg-card/98 shadow-2xl sm:max-w-xl!">
        <DrawerHeader className="relative border-b border-border px-5 pb-5 pr-14 pt-6 text-left sm:px-7 sm:pr-16">
          <DrawerClose asChild>
            <Button aria-label="Close possibilities" className="absolute right-4 top-4" size="icon-sm" variant="ghost"><X /></Button>
          </DrawerClose>
          <Badge className="mb-2 w-fit border-primary/20 bg-primary/10 text-primary" variant="outline">
            <ListFilter data-icon="inline-start" /> Ranked universe
          </Badge>
          <DrawerTitle className="font-heading text-2xl tracking-tight">
            {candidates.length.toLocaleString()} possible words
          </DrawerTitle>
          <DrawerDescription>Every match from the complete dictionary pool, ordered by its value as your next guess.</DrawerDescription>
        </DrawerHeader>

        <div className="relative mx-5 my-4 sm:mx-7">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Filter possible words"
            autoFocus
            className="h-10 border-border bg-muted/45 pl-9 font-mono uppercase placeholder:normal-case"
            maxLength={5}
            onChange={(event) => setQuery(event.target.value.replace(/[^a-z]/gi, ""))}
            placeholder="Find a word…"
            value={query}
          />
        </div>

        <div className="grid grid-cols-[48px_1fr_auto_52px] gap-3 px-5 pb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground sm:px-7">
          <span>Rank</span><span>Word</span><span>Profile</span><span className="text-right">Score</span>
        </div>
        <Separator />

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 py-2 sm:px-5">
            {visible.map(({ word, score, commonness, rank }) => (
              <Button className="grid h-12 w-full grid-cols-[48px_1fr_auto_52px] gap-3 rounded-lg px-2 text-left hover:bg-muted/60" key={word} onClick={() => onChoose(word)} variant="ghost">
                <span className="font-mono text-[10px] text-muted-foreground">#{rank}</span>
                <strong className="font-mono text-sm uppercase tracking-[0.12em]">{word}</strong>
                <span className="text-[10px] capitalize text-muted-foreground">{commonnessLabel(commonness)}</span>
                <Badge className="justify-self-end font-mono text-[10px]" variant="secondary">{score}</Badge>
              </Button>
            ))}

            {!visible.length && <div className="grid h-40 place-items-center text-sm text-muted-foreground">No possible word contains “{query}”.</div>}

            {visibleCount < filtered.length && (
              <Button className="mt-3 w-full" onClick={() => setVisibleCount((count) => count + 250)} variant="outline">
                Show 250 more <span className="text-muted-foreground">({(filtered.length - visibleCount).toLocaleString()} left)</span>
              </Button>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

function HelpDialog({ open, onOpenChange }) {
  const steps = [
    ["Make your guess", "Type any five-letter word, or accept the faded recommendation."],
    ["Copy the colors", "Click each tile to cycle gray, yellow, and green until it matches Wordle."],
    ["Apply and repeat", "We eliminate impossible words and rank the complete dictionary again."],
  ];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="border-border bg-card/98 p-0 sm:max-w-lg">
        <DialogHeader className="p-6 pb-3">
          <Badge className="mb-2 w-fit border-primary/20 bg-primary/10 text-primary" variant="outline"><BookOpen data-icon="inline-start" /> Quick start</Badge>
          <DialogTitle className="font-heading text-2xl tracking-tight">Bring your Wordle clues here</DialogTitle>
          <DialogDescription>No syntax or forms. Just reproduce what happened in the game.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 px-6 pb-4">
          {steps.map(([title, description], index) => (
            <div className="grid grid-cols-[36px_1fr] gap-3 rounded-xl border border-border bg-muted/35 p-3" key={title}>
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">0{index + 1}</div>
              <div><p className="font-medium text-foreground">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p></div>
            </div>
          ))}
        </div>
        <Separator />
        <div className="flex flex-wrap justify-center gap-5 p-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><i className="size-3 rounded-sm bg-wordle-absent" /> Absent</span>
          <span className="flex items-center gap-2"><i className="size-3 rounded-sm bg-wordle-present" /> Wrong spot</span>
          <span className="flex items-center gap-2"><i className="size-3 rounded-sm bg-wordle-correct" /> Correct spot</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function App() {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState("");
  const [draftStates, setDraftStates] = useState(emptyStates);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef();

  const candidates = useMemo(() => filterCandidates(words, history), [history]);
  const { ranked: rankedCandidates, isRanking } = useRankedCandidates(candidates);
  const suggestion = rankedCandidates[suggestionIndex]?.word || "";
  const solved = history.at(-1)?.states.every((state) => state === "correct") || false;
  const guessesExhausted = history.length >= MAX_GUESSES && !solved;
  const keyStates = useMemo(() => keyboardStates(history), [history]);
  const canPlay = !solved && !guessesExhausted && candidates.length > 0;

  useEffect(() => {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#101210" : "#f5f7f4");
    try {
      window.localStorage.setItem("wordle-solver-theme", theme);
    } catch {
      // Theme still works when storage is unavailable.
    }
  }, [theme]);

  const showNotice = useCallback((message) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const useSuggestion = useCallback(() => {
    if (!canPlay) return;
    if (!suggestion) {
      showNotice(isRanking ? "Ranking the full dictionary…" : "No suggestion available");
      return;
    }
    setDraft(suggestion);
    setDraftStates(emptyStates());
    setNotice("");
  }, [canPlay, isRanking, showNotice, suggestion]);

  const applyFeedback = useCallback(() => {
    if (!canPlay) return;
    if (draft.length !== 5) {
      showNotice("Enter all five letters first");
      return;
    }
    setHistory((current) => [...current, { word: draft, states: draftStates }]);
    setDraft("");
    setDraftStates(emptyStates());
    setSuggestionIndex(0);
    setNotice("");
  }, [canPlay, draft, draftStates, showNotice]);

  const handleKey = useCallback((key) => {
    if (!canPlay) return;
    if (key === "ENTER") {
      if (!draft) useSuggestion();
      else applyFeedback();
    } else if (key === "BACKSPACE") {
      const removedIndex = draft.length - 1;
      setDraft((current) => current.slice(0, -1));
      if (removedIndex >= 0) {
        setDraftStates((states) => states.map((state, index) => index === removedIndex ? "absent" : state));
      }
    } else if (/^[a-z]$/i.test(key) && draft.length < 5) {
      setDraft((current) => `${current}${key.toLowerCase()}`);
    }
  }, [applyFeedback, canPlay, draft, useSuggestion]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (helpOpen || drawerOpen) return;
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Enter") handleKey("ENTER");
      else if (event.key === "Backspace") handleKey("BACKSPACE");
      else if (/^[a-z]$/i.test(event.key)) handleKey(event.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, handleKey, helpOpen]);

  const cycleState = (index) => {
    if (!draft[index]) return;
    setDraftStates((current) => current.map((state, stateIndex) => stateIndex === index ? cycleTileState(state) : state));
  };

  const browseSuggestion = (direction) => {
    if (!rankedCandidates.length || draft) return;
    setSuggestionIndex((current) => (current + direction + rankedCandidates.length) % rankedCandidates.length);
  };

  const clearDraft = () => {
    setDraft("");
    setDraftStates(emptyStates());
    setSuggestionIndex(0);
    setNotice("");
  };

  const undo = () => {
    setHistory((current) => current.slice(0, -1));
    clearDraft();
  };

  const reset = () => {
    setHistory([]);
    clearDraft();
  };

  const chooseCandidate = (word) => {
    setDrawerOpen(false);
    if (!canPlay) return;
    setDraft(word);
    setDraftStates(emptyStates());
  };

  const primaryMessage = solved
    ? "Solved. That was clean."
    : guessesExhausted
      ? "Six guesses used. Undo one to explore another route."
      : candidates.length === 0
        ? "No dictionary word matches those colors. Check the previous row."
        : history.length === 0
          ? "Start with the strongest full-dictionary guess, or type your own."
          : `${candidates.length.toLocaleString()} words still fit every clue.`;

  const activeRank = rankedCandidates[suggestionIndex];
  const alternatives = rankedCandidates
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
    .filter(({ word }) => word !== suggestion)
    .slice(0, 5);

  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute -left-40 top-[-20rem] size-[42rem] rounded-full bg-primary/[0.075] blur-[130px]" />
        <div className="absolute -right-40 top-1/3 size-[34rem] rounded-full bg-[#c9a84e]/[0.045] blur-[130px]" />
        <div className="noise absolute inset-0 opacity-[0.035]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a aria-label="Wordle Solver home" className="group" href={import.meta.env.BASE_URL}>
            <AnimatedBrand />
          </a>

          <div className="flex items-center gap-2">
            <Badge className="hidden border-border bg-muted/45 font-mono text-[9px] uppercase tracking-wider text-muted-foreground lg:flex" variant="outline">
              {words.length.toLocaleString()} words
            </Badge>
            <IconButton label={theme === "dark" ? "Use light mode" : "Use dark mode"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </IconButton>
            <IconButton label="How it works" onClick={() => setHelpOpen(true)}><CircleHelp /></IconButton>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild className="hidden sm:inline-flex" size="icon" variant="outline"><a aria-label="View source on GitHub" href="https://github.com/ryyanrashid01/wordle_solver" rel="noreferrer" target="_blank"><Code2 /></a></Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>View source</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_430px]">
          <Card className="gap-0 border border-border bg-card/80 py-0 shadow-[0_24px_90px_rgba(0,0,0,.16)] backdrop-blur-xl">
            <CardHeader className="border-b border-border px-5 py-5 sm:px-7">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="font-mono text-[9px] uppercase tracking-[0.12em]" variant="secondary">Board {Math.min(history.length + 1, MAX_GUESSES)}/{MAX_GUESSES}</Badge>
                  {isRanking && <Badge className="border-primary/15 bg-primary/[0.06] text-primary" variant="outline"><LoaderCircle className="animate-spin" data-icon="inline-start" /> Ranking</Badge>}
                  {solved && <Badge className="border-primary/20 bg-primary/10 text-primary" variant="outline"><Check data-icon="inline-start" /> Solved</Badge>}
                </div>
                <CardTitle className="font-heading text-lg">Your game</CardTitle>
                <CardDescription className="mt-1 max-w-lg text-xs leading-5 sm:text-sm">{primaryMessage}</CardDescription>
              </div>
              <CardAction className="flex gap-2">
                <IconButton disabled={!history.length} label="Undo last guess" onClick={undo}><Undo2 /></IconButton>
                <IconButton label="Start over" onClick={reset}><RotateCcw /></IconButton>
              </CardAction>
            </CardHeader>

            <CardContent className="px-4 pb-6 pt-7 sm:px-7 sm:pb-7">
              <div className="relative">
                <div aria-live="polite" className={cn("pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 -translate-y-2 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background opacity-0 shadow-xl transition-all", notice && "translate-y-0 opacity-100")}>{notice}</div>
                <Board draft={draft} draftStates={draftStates} history={history} isRanking={isRanking} onCycle={cycleState} onUseSuggestion={useSuggestion} solved={solved} suggestion={suggestion} />
              </div>

              {canPlay && (
                <div className="mx-auto mb-4 mt-5 grid w-full max-w-[440px] grid-cols-[42px_1fr_42px] overflow-hidden rounded-xl border border-border bg-muted/20">
                  <Button aria-label="Previous suggestion" className="h-full rounded-none border-0" disabled={Boolean(draft) || isRanking} onClick={() => browseSuggestion(-1)} variant="ghost"><ArrowLeft /></Button>
                  <div className="flex min-h-12 items-center justify-center gap-3 border-x border-border px-2">
                    <span className="hidden font-mono text-[9px] uppercase tracking-wider text-muted-foreground sm:inline">{draft ? "Match the colors" : isRanking ? "Scanning dictionary" : `${suggestionIndex + 1} of ${rankedCandidates.length.toLocaleString()}`}</span>
                    <Button className="h-7 px-2 text-xs" disabled={isRanking && !draft} onClick={draft ? applyFeedback : useSuggestion} variant="secondary">{draft ? "Apply colors" : isRanking ? "Calculating…" : "Use suggestion"}</Button>
                  </div>
                  <Button aria-label="Next suggestion" className="h-full rounded-none border-0" disabled={Boolean(draft) || isRanking} onClick={() => browseSuggestion(1)} variant="ghost"><ArrowRight /></Button>
                </div>
              )}

              <div className={cn(!canPlay && "mt-6")}>
                <Keyboard onKey={handleKey} states={keyStates} />
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-center text-[10px] text-muted-foreground"><Info className="size-3" /> Click a tile to cycle gray → yellow → green</div>
            </CardContent>
          </Card>

          <Card className="gap-0 border border-border bg-card/80 py-0 shadow-[0_24px_90px_rgba(0,0,0,.12)] backdrop-blur-xl lg:sticky lg:top-20">
            <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
              <div>
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-primary">{solved ? "Solved in your game" : "Best next guess"}</p>
                {isRanking ? <Skeleton className="h-9 w-36 bg-muted" /> : <CardTitle className="font-mono text-3xl uppercase tracking-[0.16em]">{suggestion || (solved ? history.at(-1)?.word : "No match")}</CardTitle>}
                {activeRank && <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{commonnessLabel(activeRank.commonness)} vocabulary · ESDB tier {activeRank.commonness}</p>}
              </div>
              <CardAction>
                {activeRank && <div className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.065] px-3 py-2"><strong className="font-mono text-xl text-primary">{activeRank.score}</strong><span className="font-mono text-[7px] uppercase leading-3 tracking-wider text-muted-foreground">smart<br />score</span></div>}
              </CardAction>
            </CardHeader>

            <CardContent className="p-0">
              <div className="grid grid-cols-2 border-b border-border">
                <div className="px-5 py-4 sm:px-6"><strong className="font-mono text-lg">{candidates.length.toLocaleString()}</strong><p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">possible words</p></div>
                <div className="border-l border-border px-5 py-4 sm:px-6"><strong className="font-mono text-lg">{isRanking ? "…" : activeRank?.entropy == null ? "—" : activeRank.entropy.toFixed(2)}</strong><p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">information bits</p></div>
              </div>

              <div className="m-5 flex gap-3 rounded-xl border border-primary/15 bg-primary/[0.045] p-3.5 sm:m-6">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-[11px] leading-5 text-muted-foreground"><strong className="text-foreground">The full dictionary is in play.</strong> Information gain leads the ranking, while ESDB commonness keeps obscure words from crowding better everyday guesses.</p>
              </div>

              <div className="px-5 pb-4 sm:px-6">
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground"><span>Strong alternatives</span><span>Score</span></div>
                {isRanking
                  ? Array.from({ length: 5 }, (_, index) => <Skeleton className="mb-1 h-11 w-full bg-muted" key={index} />)
                  : alternatives.map(({ word, score, rank }) => (
                    <Button className="h-11 w-full justify-between border-t border-border px-1 hover:bg-transparent hover:text-primary" key={word} onClick={() => chooseCandidate(word)} variant="ghost">
                      <span className="flex items-center gap-3"><i className="w-5 font-mono text-[9px] not-italic text-muted-foreground">{rank}</i><strong className="font-mono text-xs uppercase tracking-[0.12em]">{word}</strong></span>
                      <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">{score}<ChevronRight className="size-3" /></span>
                    </Button>
                  ))}
                {!isRanking && rankedCandidates.length === 1 && <p className="py-5 text-center text-xs text-muted-foreground">Only one word fits every color.</p>}
                {!isRanking && !rankedCandidates.length && <p className="py-5 text-center text-xs text-muted-foreground">Undo the last row to recover possible words.</p>}
              </div>

              <div className="border-t border-border p-5 sm:p-6">
                <Button className="h-10 w-full" disabled={isRanking || !rankedCandidates.length} onClick={() => setDrawerOpen(true)} variant="outline"><ListFilter data-icon="inline-start" /> Show all possibilities</Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex max-w-7xl flex-col justify-between gap-2 border-t border-border px-4 py-6 font-mono text-[9px] uppercase tracking-wider text-muted-foreground sm:flex-row sm:px-6">
        <span>Built for that “one more guess” feeling.</span>
        <span>{words.length.toLocaleString()} words · ESDB {WORD_SOURCE.ref} · processed locally</span>
      </footer>

      <CandidateDrawer candidates={rankedCandidates} onChoose={chooseCandidate} onOpenChange={setDrawerOpen} open={drawerOpen} />
      <HelpDialog onOpenChange={setHelpOpen} open={helpOpen} />
    </div>
  );
}

export default App;
