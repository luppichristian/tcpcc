/**
 * Inspectable, round-based TCP congestion-control teaching model.
 * Windows are measured in MSS. Events represent one completed RTT round.
 */

export const ALGORITHMS = ["Tahoe", "Vegas", "Reno", "BIC", "BBS", "Cubic"];

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function applyAcknowledgement(state, algorithm, rtt, options) {
  if (algorithm === "Vegas") {
    const baseRtt = state.minRtt;
    const expected = state.cwnd / baseRtt;
    const actual = state.cwnd / Math.max(rtt, baseRtt);
    const difference = (expected - actual) * baseRtt;
    if (state.cwnd < state.ssthresh) state.cwnd *= 2;
    else if (difference < options.vegasAlpha) state.cwnd += 1 / state.cwnd;
    else if (difference > options.vegasBeta) state.cwnd = Math.max(1, state.cwnd - 1 / state.cwnd);
    return;
  }

  if (algorithm === "BIC") {
    if (state.cwnd < state.ssthresh) state.cwnd *= 2;
    else {
      const distance = Math.abs(state.bicTarget - state.cwnd);
      state.cwnd += clamp(distance / Math.max(state.cwnd, 1), 0.12, 1.4) / state.cwnd * 8;
      if (state.cwnd >= state.bicTarget) state.bicTarget += Math.max(8, state.bicTarget * 0.15);
    }
    return;
  }

  if (algorithm === "BBS") {
    // BBR-inspired bandwidth/RTT estimate, labelled BBS for this visualizer.
    const deliveryRate = state.cwnd / rtt;
    state.bandwidth = Math.max(state.bandwidth * 0.92, deliveryRate);
    const target = Math.max(2, state.bandwidth * state.minRtt * options.bbsGain);
    state.cwnd += clamp((target - state.cwnd) * 0.22, -0.75, 1.5);
    return;
  }

  if (algorithm === "Cubic") {
    if (state.cwnd < state.ssthresh) state.cwnd *= 2;
    else {
      state.epoch += rtt / 1000;
      const k = Math.cbrt((state.lastMax - state.cwnd) / 0.4 || 0);
      const target = 0.4 * Math.pow(state.epoch - k, 3) + state.lastMax;
      state.cwnd += clamp((target - state.cwnd) / Math.max(state.cwnd, 1), 0.03, 1.25);
    }
    return;
  }

  // A full RTT returns approximately one ACK per in-flight segment, doubling cwnd in slow start.
  if (state.cwnd < state.ssthresh) state.cwnd *= 2;
  // Congestion avoidance increases by roughly one MSS per RTT, not one MSS per ACK.
  else state.cwnd += 1;
}

function applyLoss(state, algorithm, event) {
  state.ssthresh = Math.max(2, state.cwnd / 2);
  if (algorithm === "Tahoe" || event === "timeout") {
    if (algorithm === "Cubic") state.lastMax = state.cwnd;
    state.cwnd = 1;
    state.epoch = 0;
    return;
  }
  if (algorithm === "Reno") state.cwnd = state.ssthresh;
  else if (algorithm === "BIC") {
    state.bicTarget = state.cwnd;
    state.cwnd = state.ssthresh;
  } else if (algorithm === "BBS") state.cwnd = Math.max(2, state.ssthresh * 1.15);
  else if (algorithm === "Vegas") state.cwnd = state.ssthresh;
  else if (algorithm === "Cubic") {
    state.lastMax = state.cwnd;
    state.cwnd = state.ssthresh;
    state.epoch = 0;
  }
}

/** Runs a deterministic discrete-time congestion-control simulation. */
export function simulate(rawOptions) {
  const options = {
    algorithm: rawOptions.algorithm ?? "Cubic",
    rounds: clamp(Number(rawOptions.rounds) || 120, 1, 2000),
    minRtt: clamp(Number(rawOptions.minRtt) || 40, 1, 5000),
    maxRtt: clamp(Number(rawOptions.maxRtt) || 120, 1, 5000),
    lossPercent: clamp(Number(rawOptions.lossPercent) || 0, 0, 100),
    initialCwnd: clamp(Number(rawOptions.initialCwnd) || 1, 1, 10000),
    ssthresh: clamp(Number(rawOptions.ssthresh) || 16, 2, 10000),
    seed: Number(rawOptions.seed) || 2026,
    vegasAlpha: clamp(Number(rawOptions.vegasAlpha) || 1, 0.1, 50),
    vegasBeta: clamp(Number(rawOptions.vegasBeta) || 3, 0.2, 100),
    bbsGain: clamp(Number(rawOptions.bbsGain) || 1.25, 0.1, 10),
  };
  if (options.maxRtt < options.minRtt) [options.minRtt, options.maxRtt] = [options.maxRtt, options.minRtt];
  if (!ALGORITHMS.includes(options.algorithm)) options.algorithm = "Cubic";

  const random = seededRandom(options.seed);
  const state = {
    cwnd: options.initialCwnd, ssthresh: options.ssthresh, minRtt: options.maxRtt,
    bandwidth: options.initialCwnd / options.maxRtt, bicTarget: options.initialCwnd * 1.25,
    lastMax: options.initialCwnd, epoch: 0,
  };
  const samples = [{ round: 0, cwnd: state.cwnd, ssthresh: state.ssthresh, rtt: options.minRtt, event: null }];
  const counters = { acknowledgements: 0, fastRetransmits: 0, timeouts: 0 };

  for (let round = 1; round <= options.rounds; round++) {
    const rtt = options.minRtt + random() * (options.maxRtt - options.minRtt);
    state.minRtt = Math.min(state.minRtt, rtt);
    let event = null;
    if (random() * 100 < options.lossPercent) {
      // A loss can produce 3 duplicate ACKs only when enough later segments exist.
      event = state.cwnd >= 4 && random() < 0.72 ? "fast" : "timeout";
      applyLoss(state, options.algorithm, event);
      counters[event === "fast" ? "fastRetransmits" : "timeouts"]++;
    } else {
      applyAcknowledgement(state, options.algorithm, rtt, options);
      counters.acknowledgements++;
    }
    state.cwnd = clamp(state.cwnd, 1, 100000);
    samples.push({ round, cwnd: state.cwnd, ssthresh: state.ssthresh, rtt, event });
  }
  return { options, samples, counters, final: { cwnd: state.cwnd, ssthresh: state.ssthresh, minRtt: state.minRtt } };
}
