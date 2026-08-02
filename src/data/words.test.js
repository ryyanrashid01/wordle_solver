import { describe, expect, test } from "bun:test";
import answerWords from "./answerWords";
import words, { WORD_SOURCE, wordCommonness } from "./words";

describe("complete word universe", () => {
  test("contains the generated ESDB and extended vocabulary", () => {
    expect(words).toHaveLength(10982);
    expect(new Set(words).size).toBe(words.length);
    expect(words.every((word) => /^[a-z]{5}$/.test(word))).toBe(true);
    expect(WORD_SOURCE.ref).toBe("rel-2026.02.25");
    expect(WORD_SOURCE.esdbWords).toBe(8888);
    expect(wordCommonness.size).toBe(words.length);
  });

  test("does not drop words that only existed in the legacy answer set", () => {
    const dictionary = new Set(words);
    expect(answerWords.every((word) => dictionary.has(word))).toBe(true);
    expect(dictionary.has("ramen")).toBe(true);
    expect(dictionary.has("latte")).toBe(true);
  });
});
