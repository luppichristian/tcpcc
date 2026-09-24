import { simulate } from "./simulation.js";

const ids = ["algorithm", "rounds", "seed", "minRtt", "maxRtt", "lossPercent", "initialCwnd", "ssthresh", "vegasAlpha", "vegasBeta", "bbsGain"];
const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const canvas = document.getElementById("chart");
const context = canvas.getContext("2d");
let lastRun;

function options() {
  return Object.fromEntries(ids.map(id => [id, elements[id].value]));
}

function format(value, digits = 1) {
  return Number(value).toFixed(digits).replace(/\.0$/, "");
}

function roundLabel(round) {
  return `RTT ${round}`;
}

function draw(run) {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = box.width, height = box.height, pad = {
    left: 50, right: 15, top: 18, bottom: 34
  };
  const innerWidth = width - pad.left - pad.right, innerHeight = height - pad.top - pad.bottom;
  const maxCwnd = Math.max(4, ...run.samples.map(s => Math.max(s.cwnd, s.ssthresh))) * 1.08;
  const x = round => pad.left + (round / run.options.rounds) * innerWidth;
  const y = cwnd => pad.top + innerHeight - (cwnd / maxCwnd) * innerHeight;
  context.clearRect(0, 0, width, height);
  context.font = "11px Segoe UI, sans-serif";
  context.fillStyle = "#65717d";
  context.strokeStyle = "#e4dfd6";
  context.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const value = maxCwnd * i / 5, yy = y(value);
    context.beginPath();
    context.moveTo(pad.left, yy);
    context.lineTo(width - pad.right, yy);
    context.stroke();
    context.fillText(format(value), 5, yy + 4);
  }

  for (let i = 0; i <= 5; i++) {
    const round = Math.round(run.options.rounds * i / 5), xx = x(round);
    context.fillText(`${round}`, xx - 7, height - 10);
  }

  context.fillText("cwnd (MSS)", pad.left, 11);
  context.fillText("RTT sample", width - 76, height - 10);

  // ssthresh is intentionally dashed so it remains legible under the primary trajectory.
  context.save(); context.setLineDash([5, 4]);
  context.strokeStyle = "#21a4a4";
  context.beginPath();

  run.samples.forEach((s, i) => {
    const xx = x(s.round), yy = y(s.ssthresh);
    if (!i)
      context.moveTo(xx, yy);
    else
      context.lineTo(xx, yy);
  });

  context.stroke();
  context.restore();

  run.samples.forEach(sample => {
    if (!sample.event)
      return;

    context.strokeStyle = sample.event === "fast" ? "#ef9b22" : "#ce4a46";
    context.lineWidth = 1.5;
    const xx = x(sample.round);
    context.beginPath();
    context.moveTo(xx, pad.top);
    context.lineTo(xx, pad.top + innerHeight);
    context.stroke();
  });

  context.strokeStyle = "#1268a7";
  context.lineWidth = 2.4;
  context.lineJoin = "round";
  context.beginPath();

  run.samples.forEach((s, i) => {
    const xx = x(s.round), yy = y(s.cwnd);
    if (!i)
      context.moveTo(xx, yy);
    else
      context.lineTo(xx, yy);
  });

  context.stroke();
}

function render(run) {
  document.getElementById("activeAlgorithm").textContent = run.options.algorithm;
  document.getElementById("finalCwnd").textContent = `${format(run.final.cwnd)} MSS`;
  document.getElementById("finalRtt").textContent = `${format(run.final.minRtt)} ms`;
  document.getElementById("eventCount").textContent = `${run.counters.fastRetransmits} fast / ${run.counters.timeouts} RTO`;
  document.getElementById("chartSubtitle").textContent = `${run.options.rounds} RTT samples · one congestion-control update per RTT · loss ${format(run.options.lossPercent)}%`;
  const eventList = document.getElementById("events"); eventList.replaceChildren();
  const events = run.samples.filter(sample => sample.event);
  if (!events.length) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No loss events in this deterministic run.";
    eventList.append(item);
  }
  else events.slice(0, 10).forEach(sample => {
    const item = document.createElement("li");
    item.className = sample.event === "timeout" ? "timeout" : "fast";
    item.textContent = `${roundLabel(sample.round)} — ${sample.event === "fast" ? "3 ACK fast retransmit" : "timeout"}`;
    eventList.append(item);
  });

  if (events.length > 10) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = `+ ${events.length - 10} more`;
    eventList.append(item);
  }

  draw(run);
}

function run() {
  lastRun = simulate(options());
  render(lastRun);
  localStorage.setItem("tcpcc-options", JSON.stringify(options()));
}

function download() {
  if (!lastRun)
    return;

  const rows = ["rtt_sample,cwnd_mss,ssthresh_mss,rtt_ms,event", ...lastRun.samples.map(
    s => [s.round, s.cwnd.toFixed(4), s.ssthresh.toFixed(4), s.rtt.toFixed(3), s.event ?? ""].join(","))];
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  link.download = `tcpcc-${lastRun.options.algorithm.toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const defaults = { algorithm: "Cubic", rounds: "120", seed: "2026", minRtt: "40", maxRtt: "120", lossPercent: "2", initialCwnd: "1", ssthresh: "16", vegasAlpha: "1", vegasBeta: "3", bbsGain: "1.25" };

try {
  const saved = JSON.parse(localStorage.getItem("tcpcc-options"));
  Object.entries({ ...defaults, ...saved }).forEach(([id, value]) => {
    if (elements[id])
      elements[id].value = value;
  });
} catch {
  Object.entries(defaults).forEach(([id, value]) => elements[id].value = value);
}

document.getElementById("run").addEventListener("click", run);
document.getElementById("download").addEventListener("click", download);
document.getElementById("reset").addEventListener("click", () => {
  Object.entries(defaults).forEach(([id, value]) => elements[id].value = value);
  run();
});

window.addEventListener("resize", () => lastRun && draw(lastRun));
run();