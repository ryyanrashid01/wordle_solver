import { describe, expect, test } from "bun:test";

import words, { wordCommonness } from "../data/words";
import { buildScoringWalkthrough } from "./scoring-walkthrough";

describe("Scoring walkthrough", () => {
  test("reproduces the complete APPLE recommendation path", () => {
    const walkthrough = buildScoringWalkthrough("apple", words, wordCommonness);

    expect(walkthrough.rounds.map(({ guess }) => guess)).toEqual([
      "rates",
      "plane",
      "ample",
    ]);
    expect(walkthrough.rounds.map(({ after }) => after)).toEqual([191, 2, 1]);
    expect(walkthrough.rounds.map(({ pattern }) => pattern)).toEqual([
      "01010",
      "11102",
      "20222",
    ]);
    expect(walkthrough.rounds[0].analysis.patternCount).toBe(190);
    expect(walkthrough.rounds[0].analysis.largestPattern).toBe("00000");
    expect(walkthrough.rounds[0].analysis.worstCase).toBe(621);
    expect(walkthrough.rounds[0].analysis.topBuckets[0]).toMatchObject({
      pattern: "00000",
      size: 621,
    });
    expect(walkthrough.rounds[0].ranking[0].word).toBe("rates");
    expect(typeof walkthrough.rounds[0].ranking[0].frequency).toBe("number");
    expect(walkthrough.rounds[0].letterQuality).toMatchObject({
      positionValue: 6872,
      coverageValue: 16518,
      duplicateCount: 0,
    });
    expect(walkthrough.rounds[0].letterQuality.rawScore).toBeCloseTo(
      walkthrough.rounds[0].ranking[0].frequency,
      10,
    );
    expect(typeof walkthrough.rounds[0].scoreRange.minimum).toBe("number");
    expect(typeof walkthrough.rounds[0].scoreRange.maximum).toBe("number");
    expect(walkthrough.rounds[1].ranking[0].word).toBe("plane");
    expect(walkthrough.finalWord).toBe("apple");
    expect(walkthrough.guessesToSolve).toBe(4);
  });
});
