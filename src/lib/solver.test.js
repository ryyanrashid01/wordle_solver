import { describe, expect, test } from "bun:test";
import {
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

});
