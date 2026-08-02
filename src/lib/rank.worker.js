import { rankCandidates } from "./solver";

self.onmessage = ({ data: { candidates, commonness } }) => {
  const wordCommonness = new Map(
    candidates.map((word, index) => [word, commonness[index]]),
  );
  self.postMessage(rankCandidates(candidates, wordCommonness));
};
