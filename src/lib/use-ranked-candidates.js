import { useEffect, useState } from "react";

import { wordCommonness } from "../data/words";
import { rankCandidates } from "./solver";

export function useRankedCandidates(candidates) {
  const [result, setResult] = useState({ source: null, ranked: [] });

  useEffect(() => {
    if (!candidates.length) return undefined;

    let cancelled = false;
    let fallbackTimer;

    if (typeof Worker === "undefined") {
      fallbackTimer = window.setTimeout(() => {
        if (!cancelled) {
          setResult({
            source: candidates,
            ranked: rankCandidates(candidates, wordCommonness),
          });
        }
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(fallbackTimer);
      };
    }

    const worker = new Worker(new URL("./rank.worker.js", import.meta.url), {
      type: "module",
    });

    worker.onmessage = ({ data }) => {
      if (!cancelled) setResult({ source: candidates, ranked: data });
      worker.terminate();
    };
    worker.onerror = () => {
      if (!cancelled) {
        setResult({
          source: candidates,
          ranked: rankCandidates(candidates, wordCommonness),
        });
      }
      worker.terminate();
    };
    worker.postMessage({
      candidates,
      commonness: candidates.map((word) => wordCommonness.get(word) ?? 80),
    });

    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, [candidates]);

  if (!candidates.length) return { ranked: [], isRanking: false };
  const isReady = result.source === candidates;
  return { ranked: isReady ? result.ranked : [], isRanking: !isReady };
}
