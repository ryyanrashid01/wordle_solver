import { describe, expect, test } from "bun:test";
import words, { WORD_SOURCE, wordCommonness } from "./words";

describe("ESDB word universe", () => {
  test("contains only normalized five-letter ESDB entries", () => {
    expect(words).toHaveLength(8888);
    expect(new Set(words).size).toBe(words.length);
    expect(words.every((word) => /^[a-z]{5}$/.test(word))).toBe(true);
    expect(WORD_SOURCE.ref).toBe("rel-2026.02.25");
    expect(WORD_SOURCE.wordCount).toBe(8888);
    expect(WORD_SOURCE.size).toBe(80);
    expect(WORD_SOURCE.spellings).toBe("A/B/Z");
    expect(WORD_SOURCE.variantLevel).toBe(5);
    expect(wordCommonness.size).toBe(words.length);
  });

  test("keeps commonness tiers within the selected ESDB range", () => {
    expect([...wordCommonness.values()].every((tier) => tier >= 35 && tier <= 80)).toBe(true);
  });
});
