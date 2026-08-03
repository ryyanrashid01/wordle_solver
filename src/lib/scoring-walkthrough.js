import {
  analyzeLetterQuality,
  analyzeGuess,
  filterCandidates,
  patternKey,
  rankCandidates,
  scoreGuess,
} from "./solver";

const MAX_EXPLAINED_ROUNDS = 12;

export function buildScoringWalkthrough(hiddenWord, allWords, commonnessByWord) {
  if (!allWords.includes(hiddenWord)) {
    throw new Error(`${hiddenWord.toUpperCase()} is not in the solver dictionary.`);
  }

  const rounds = [];
  let candidates = allWords;

  for (let index = 0; index < MAX_EXPLAINED_ROUNDS; index += 1) {
    const ranked = rankCandidates(candidates, commonnessByWord, {
      includeDetails: true,
    });
    const guess = ranked[0].word;
    const states = scoreGuess(hiddenWord, guess);
    const nextCandidates = filterCandidates(candidates, [{ word: guess, states }]);

    rounds.push({
      before: candidates.length,
      after: nextCandidates.length,
      guess,
      states,
      pattern: patternKey(states),
      analysis: analyzeGuess(guess, candidates),
      letterQuality: analyzeLetterQuality(guess, candidates),
      ranking: ranked.slice(0, 5),
      scoreRange: {
        minimum: ranked.at(-1).rawScore,
        maximum: ranked[0].rawScore,
      },
    });

    if (nextCandidates.length <= 1) {
      return {
        hiddenWord,
        rounds,
        finalWord: nextCandidates[0] || null,
        guessesToSolve:
          rounds.length + (guess === hiddenWord ? 0 : 1),
      };
    }

    candidates = nextCandidates;
  }

  throw new Error("This path took too many rounds to explain safely.");
}
