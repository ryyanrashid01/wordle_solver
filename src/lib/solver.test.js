import { describe, expect, test } from "bun:test";
import {
  analyzeGuess,
  cycleTileState,
  filterCandidates,
  patternKey,
  rankCandidates,
  scoreGuess,
} from "./solver";

describe("Wordle scoring", () => {
  test("scores exact, present, and absent letters", () => {
    expect(scoreGuess("cigar", "raise")).toEqual([
      "present",
      "present",
      "present",
      "absent",
      "absent",
    ]);
  });

  test("does not over-count duplicate letters", () => {
    expect(scoreGuess("cigar", "array")).toEqual([
      "absent",
      "present",
      "absent",
      "correct",
      "absent",
    ]);
    expect(scoreGuess("abbey", "bobby")).toEqual([
      "present",
      "absent",
      "correct",
      "absent",
      "correct",
    ]);
  });

  test("filters candidates by the exact feedback pattern", () => {
    const history = [{ word: "raise", states: scoreGuess("cigar", "raise") }];
    expect(filterCandidates(["cigar", "rebut", "sissy"], history)).toEqual([
      "cigar",
    ]);
  });

  test("cycles through the three Wordle tile states", () => {
    expect(cycleTileState("absent")).toBe("present");
    expect(cycleTileState("present")).toBe("correct");
    expect(cycleTileState("correct")).toBe("absent");
  });

  test("encodes a pattern consistently", () => {
    expect(patternKey(["absent", "present", "correct", "absent", "correct"])).toBe(
      "01202",
    );
  });

  test("uses commonness to break equally informative choices", () => {
    const candidates = ["lares", "slate"];
    const commonness = new Map([["lares", 80], ["slate", 35]]);
    expect(rankCandidates(candidates, commonness)[0].word).toBe("slate");
  });

  test("exposes entropy buckets for the interactive scoring guide", () => {
    const analysis = analyzeGuess("cigar", ["cigar", "rebut"]);
    expect(analysis.patternCount).toBe(2);
    expect(analysis.entropy).toBe(1);
    expect(analysis.expectedRemaining).toBe(1);
    expect(analysis.worstCase).toBe(1);
    expect(analysis.buckets.map(({ pattern }) => pattern).sort()).toEqual([
      "00001",
      "22222",
    ]);
  });
});
