import words, { wordCommonness } from "../data/words";
import { buildScoringWalkthrough } from "./scoring-walkthrough";

self.onmessage = ({ data: { hiddenWord } }) => {
  try {
    self.postMessage({
      hiddenWord,
      walkthrough: buildScoringWalkthrough(hiddenWord, words, wordCommonness),
    });
  } catch (error) {
    self.postMessage({
      hiddenWord,
      error: error instanceof Error ? error.message : "Unable to calculate this path.",
    });
  }
};
