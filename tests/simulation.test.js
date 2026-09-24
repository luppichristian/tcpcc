import test from "node:test";
import assert from "node:assert/strict";

import { simulate } from "../simulation.js";

test("Vegas increases in congestion avoidance at its base RTT", () => {
  const run = simulate({
    algorithm: "Vegas",
    rounds: 1,
    minRtt: 40,
    maxRtt: 40,
    lossPercent: 0,
    initialCwnd: 2,
    ssthresh: 2,
  });

  assert.equal(run.samples[1].cwnd, 2.5);
});
