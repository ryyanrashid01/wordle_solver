export const TILE_STATES = ["absent", "present", "correct"];

export function scoreGuess(answer, guess) {
  const result = Array(5).fill("absent");
  const remaining = {};

  for (let index = 0; index < 5; index += 1) {
    if (guess[index] === answer[index]) {
      result[index] = "correct";
    } else {
      remaining[answer[index]] = (remaining[answer[index]] || 0) + 1;
    }
  }

  for (let index = 0; index < 5; index += 1) {
    const letter = guess[index];
    if (result[index] !== "correct" && remaining[letter] > 0) {
      result[index] = "present";
      remaining[letter] -= 1;
    }
  }

  return result;
}

export function patternKey(pattern) {
  return pattern
    .map((state) => ({ absent: "0", present: "1", correct: "2" })[state])
    .join("");
}

export function filterCandidates(candidates, history) {
  return candidates.filter((answer) =>
    history.every(
      ({ word, states }) =>
        patternKey(scoreGuess(answer, word)) === patternKey(states),
    ),
  );
}

function createFrequencyModel(words) {
  const position = Array.from({ length: 5 }, () => ({}));
  const overall = {};

  for (const word of words) {
    const uniqueLetters = new Set(word);
    for (let index = 0; index < 5; index += 1) {
      const letter = word[index];
      position[index][letter] = (position[index][letter] || 0) + 1;
    }
    for (const letter of uniqueLetters) {
      overall[letter] = (overall[letter] || 0) + 1;
    }
  }

  return { position, overall };
}

function frequencyScore(word, model, total) {
  const uniqueLetters = new Set(word);
  const positionValue = [...word].reduce(
    (score, letter, index) => score + (model.position[index][letter] || 0),
    0,
  );
  const coverageValue = [...uniqueLetters].reduce(
    (score, letter) => score + (model.overall[letter] || 0),
    0,
  );
  const duplicatePenalty = 5 - uniqueLetters.size;

  return (
    positionValue / (total * 5) +
    coverageValue / (total * 5) -
    duplicatePenalty * 0.035
  );
}

function getCommonnessTier(word, commonnessByWord) {
  if (!commonnessByWord) return 60;
  if (typeof commonnessByWord.get === "function") {
    return commonnessByWord.get(word) ?? 90;
  }
  return commonnessByWord[word] ?? 90;
}

function commonnessScore(tier) {
  if (tier <= 35) return 1;
  if (tier <= 40) return 0.92;
  if (tier <= 50) return 0.78;
  if (tier <= 60) return 0.62;
  if (tier <= 65) return 0.5;
  if (tier <= 70) return 0.35;
  if (tier <= 80) return 0.15;
  return 0.02;
}

function entropyForGuess(guess, possibleAnswers) {
  const groups = new Map();

  for (const answer of possibleAnswers) {
    const key = patternKey(scoreGuess(answer, guess));
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  return [...groups.values()].reduce((entropy, groupSize) => {
    const probability = groupSize / possibleAnswers.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

export function rankCandidates(candidates, commonnessByWord) {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) {
    return [{
      word: candidates[0],
      score: 100,
      entropy: 0,
      commonness: getCommonnessTier(candidates[0], commonnessByWord),
    }];
  }

  const model = createFrequencyModel(candidates);
  const frequencyCandidates = candidates
    .map((word) => ({
      word,
      frequency: frequencyScore(word, model, candidates.length),
      commonness: getCommonnessTier(word, commonnessByWord),
    }));
  const frequencyValues = frequencyCandidates.map(({ frequency }) => frequency);
  const minFrequency = Math.min(...frequencyValues);
  const maxFrequency = Math.max(...frequencyValues);
  const frequencyRange = maxFrequency - minFrequency || 1;
  const byHeuristic = frequencyCandidates
    .map((candidate) => {
      const normalizedFrequency = (candidate.frequency - minFrequency) / frequencyRange;
      const normalizedCommonness = commonnessScore(candidate.commonness);
      return {
        ...candidate,
        normalizedFrequency,
        normalizedCommonness,
        heuristic: normalizedFrequency * 0.78 + normalizedCommonness * 0.22,
      };
    })
    .sort((a, b) => b.heuristic - a.heuristic || a.word.localeCompare(b.word));

  // Full entropy is exact on smaller result sets. On the initial board we
  // evaluate the strongest coverage/commonness shortlist in a Web Worker.
  const evaluationSize = candidates.length <= 420 ? candidates.length : 200;
  const evaluatedWords = new Set(
    byHeuristic.slice(0, evaluationSize).map(({ word }) => word),
  );
  const maxEntropy = Math.log2(candidates.length);

  return byHeuristic
    .map(({ word, normalizedFrequency, normalizedCommonness, heuristic, commonness }) => {
      const entropy = evaluatedWords.has(word)
        ? entropyForGuess(word, candidates)
        : null;
      const normalizedEntropy = entropy === null ? 0 : entropy / maxEntropy;
      const combined =
        entropy === null
          ? heuristic * 0.35
          : normalizedEntropy * 0.82 + normalizedFrequency * 0.06 + normalizedCommonness * 0.12;

      return {
        word,
        entropy,
        commonness,
        rawScore: combined,
      };
    })
    .sort(
      (a, b) =>
        b.rawScore - a.rawScore ||
        (b.entropy || 0) - (a.entropy || 0) ||
        a.word.localeCompare(b.word),
    )
    .map((candidate, index, ranked) => ({
      word: candidate.word,
      entropy: candidate.entropy,
      commonness: candidate.commonness,
      score:
        ranked[0].rawScore === ranked.at(-1).rawScore
          ? 100
          : Math.round(
              (70 +
                30 *
                  ((candidate.rawScore - ranked.at(-1).rawScore) /
                    (ranked[0].rawScore - ranked.at(-1).rawScore))) * 10,
            ) / 10,
    }));
}

export function cycleTileState(state) {
  const index = TILE_STATES.indexOf(state);
  return TILE_STATES[(index + 1) % TILE_STATES.length];
}

export function keyboardStates(history) {
  const priority = { absent: 1, present: 2, correct: 3 };
  const letters = {};

  for (const { word, states } of history) {
    [...word].forEach((letter, index) => {
      const nextState = states[index];
      if (!letters[letter] || priority[nextState] > priority[letters[letter]]) {
        letters[letter] = nextState;
      }
    });
  }

  return letters;
}
