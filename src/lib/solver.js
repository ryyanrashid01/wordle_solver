export const TILE_STATES = ["absent", "present", "correct"];
export const RANKING_CONFIG = Object.freeze({
  entropyWeight: 0.82,
  frequencyWeight: 0.06,
  commonnessWeight: 0.12,
  heuristicFrequencyWeight: 0.78,
  heuristicCommonnessWeight: 0.22,
  shortlistThreshold: 420,
  shortlistSize: 200,
  unevaluatedScale: 0.35,
});

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

export function analyzeLetterQuality(word, words) {
  const total = words.length;
  const model = createFrequencyModel(words);
  const uniqueLetters = [...new Set(word)];
  const positionCounts = [...word].map((letter, index) => ({
    letter,
    position: index + 1,
    count: model.position[index][letter] || 0,
  }));
  const coverageCounts = uniqueLetters.map((letter) => ({
    letter,
    count: model.overall[letter] || 0,
  }));
  const positionValue = positionCounts.reduce(
    (sum, { count }) => sum + count,
    0,
  );
  const coverageValue = coverageCounts.reduce(
    (sum, { count }) => sum + count,
    0,
  );
  const duplicateCount = 5 - uniqueLetters.length;
  const positionContribution = total === 0 ? 0 : positionValue / (total * 5);
  const coverageContribution = total === 0 ? 0 : coverageValue / (total * 5);
  const duplicatePenalty = duplicateCount * 0.035;

  return {
    positionCounts,
    coverageCounts,
    positionValue,
    coverageValue,
    duplicateCount,
    positionContribution,
    coverageContribution,
    duplicatePenalty,
    rawScore: positionContribution + coverageContribution - duplicatePenalty,
  };
}

function getCommonnessTier(word, commonnessByWord) {
  if (!commonnessByWord) return 60;
  if (typeof commonnessByWord.get === "function") {
    return commonnessByWord.get(word) ?? 80;
  }
  return commonnessByWord[word] ?? 80;
}

export function commonnessScore(tier) {
  if (tier <= 35) return 1;
  if (tier <= 40) return 0.92;
  if (tier <= 50) return 0.78;
  if (tier <= 60) return 0.62;
  if (tier <= 65) return 0.5;
  if (tier <= 70) return 0.35;
  if (tier <= 80) return 0.15;
  return 0.15;
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

export function analyzeGuess(guess, possibleAnswers) {
  if (!guess || possibleAnswers.length === 0) {
    return {
      entropy: 0,
      expectedRemaining: 0,
      patternCount: 0,
      worstCase: 0,
    };
  }

  const groups = new Map();
  for (const answer of possibleAnswers) {
    const key = patternKey(scoreGuess(answer, guess));
    const group = groups.get(key) || { size: 0, examples: [] };
    group.size += 1;
    if (group.examples.length < 4) group.examples.push(answer);
    groups.set(key, group);
  }

  let entropy = 0;
  let expectedRemaining = 0;
  let worstCase = 0;

  for (const { size: groupSize } of groups.values()) {
    const probability = groupSize / possibleAnswers.length;
    entropy -= probability * Math.log2(probability);
    expectedRemaining += groupSize * probability;
    worstCase = Math.max(worstCase, groupSize);
  }

  return {
    entropy,
    expectedRemaining,
    patternCount: groups.size,
    worstCase,
    largestPattern: [...groups.entries()].sort(
      ([patternA, groupA], [patternB, groupB]) =>
        groupB.size - groupA.size || patternA.localeCompare(patternB),
    )[0]?.[0] || null,
    topBuckets: [...groups.entries()]
      .map(([pattern, group]) => ({
        pattern,
        size: group.size,
        probability: group.size / possibleAnswers.length,
        examples: group.examples,
      }))
      .sort((a, b) => b.size - a.size || a.pattern.localeCompare(b.pattern))
      .slice(0, 5),
  };
}

export function rankCandidates(candidates, commonnessByWord, { includeDetails = false } = {}) {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) {
    const commonness = getCommonnessTier(candidates[0], commonnessByWord);
    const result = {
      word: candidates[0],
      score: 100,
      entropy: 0,
      commonness,
      normalizedEntropy: 0,
      normalizedFrequency: 1,
      normalizedCommonness: commonnessScore(commonness),
      heuristic: 1,
      rawScore: 1,
      evaluated: true,
    };
    return [includeDetails ? result : {
      word: result.word,
      score: result.score,
      entropy: result.entropy,
      commonness: result.commonness,
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
        heuristic:
          normalizedFrequency * RANKING_CONFIG.heuristicFrequencyWeight +
          normalizedCommonness * RANKING_CONFIG.heuristicCommonnessWeight,
      };
    })
    .sort((a, b) => b.heuristic - a.heuristic || a.word.localeCompare(b.word));

  // Full entropy is exact on smaller result sets. On the initial board we
  // evaluate the strongest coverage/commonness shortlist in a Web Worker.
  const evaluationSize =
    candidates.length <= RANKING_CONFIG.shortlistThreshold
      ? candidates.length
      : RANKING_CONFIG.shortlistSize;
  const evaluatedWords = new Set(
    byHeuristic.slice(0, evaluationSize).map(({ word }) => word),
  );
  const maxEntropy = Math.log2(candidates.length);

  return byHeuristic
    .map(({ word, frequency, normalizedFrequency, normalizedCommonness, heuristic, commonness }) => {
      const entropy = evaluatedWords.has(word)
        ? entropyForGuess(word, candidates)
        : null;
      const normalizedEntropy = entropy === null ? 0 : entropy / maxEntropy;
      const combined =
        entropy === null
          ? heuristic * RANKING_CONFIG.unevaluatedScale
          : normalizedEntropy * RANKING_CONFIG.entropyWeight +
            normalizedFrequency * RANKING_CONFIG.frequencyWeight +
            normalizedCommonness * RANKING_CONFIG.commonnessWeight;

      return {
        word,
        frequency,
        minFrequency,
        maxFrequency,
        entropy,
        commonness,
        normalizedEntropy,
        normalizedFrequency,
        normalizedCommonness,
        heuristic,
        rawScore: combined,
        evaluated: entropy !== null,
      };
    })
    .sort(
      (a, b) =>
        b.rawScore - a.rawScore ||
        (b.entropy || 0) - (a.entropy || 0) ||
        a.word.localeCompare(b.word),
    )
    .map((candidate, index, ranked) => {
      const result = {
        ...candidate,
        score:
          ranked[0].rawScore === ranked.at(-1).rawScore
            ? 100
            : Math.round(
                (70 +
                  30 *
                    ((candidate.rawScore - ranked.at(-1).rawScore) /
                      (ranked[0].rawScore - ranked.at(-1).rawScore))) * 10,
              ) / 10,
      };

      return includeDetails ? result : {
        word: result.word,
        entropy: result.entropy,
        commonness: result.commonness,
        score: result.score,
      };
    });
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
