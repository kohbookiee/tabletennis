const home = document.querySelector("#home");
const draw = document.querySelector("#draw");
const back = document.querySelector(".mark");
const trail = document.querySelector(".trail");
const drawTrail = document.querySelector(".drawn-trail");
const drawn = document.querySelector(".drawn-table");
const preview = document.querySelector(".preview");
const previewShape = preview.querySelector("polygon");
const guide = document.querySelector(".guide");
const guideLines = [...guide.querySelectorAll("line")];
const readout = document.querySelector(".readout");
const rest = document.querySelector(".rest");
const portraitJp = document.querySelector(".portrait.is-jp");
const portraitUs = document.querySelector(".portrait.is-us");
const PORTRAIT_MAX = 10;

const RALLY_MS = 8200;
const DOT = 10;

const BL = [24, 858];
const BR = [828, 788];
const TR = [676, 30];
const TL = [308, 116];

function onTable(u, v) {
  const nx = BL[0] + (BR[0] - BL[0]) * u;
  const ny = BL[1] + (BR[1] - BL[1]) * u;
  const fx = TL[0] + (TR[0] - TL[0]) * u;
  const fy = TL[1] + (TR[1] - TL[1]) * u;
  return [nx + (fx - nx) * v, ny + (fy - ny) * v];
}

function netSide(x, y) {
  return (748 - 186) * (y - 448) - (350 - 448) * (x - 186);
}

function quad(a, control, b, t) {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
  ];
}

function arcControl(from, to, bulge) {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  let px = -dy / len;
  let py = dx / len;
  if (py > 0) {
    px = -px;
    py = -py;
  }
  return [mx + px * bulge * 2, my + py * bulge * 2];
}

function parabola(from, to, bulge, count) {
  const control = arcControl(from, to, bulge);
  const dense = [];
  for (let i = 0; i <= 70; i++) {
    const t = i / 70;
    const [x, y] = quad(from, control, to, t);
    dense.push({
      x,
      y,
      gx: from[0] + (to[0] - from[0]) * t,
      gy: from[1] + (to[1] - from[1]) * t,
      v: 0,
      lift: Math.sin(Math.PI * t),
    });
  }
  return resample(dense, count);
}

function rally(controls, count, height = 1) {
  const samples = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const u = bezier(controls.map((point) => point[0]), t);
    const v = bezier(controls.map((point) => point[1]), t);
    const [x, y] = onTable(u, v);
    samples.push({ x, y, t, side: netSide(x, y) });
  }

  const startSide = Math.sign(samples[0].side) || 1;
  let cross = samples.findIndex((sample) => Math.sign(sample.side) === -startSide);
  if (cross < 1) cross = Math.round(samples.length * 0.48);
  const bounceT = samples[cross].t * rand(0.55, 0.72);
  const bounce = samples.reduce((best, sample) =>
    Math.abs(sample.t - bounceT) < Math.abs(best.t - bounceT) ? sample : best
  );
  const start = samples[0];
  const end = samples[samples.length - 1];
  const span = Math.hypot(end.x - start.x, end.y - start.y);
  const bulge = Math.min(220, Math.max(96, span * 0.26)) * height;
  const approachCount = Math.max(7, Math.round(count * 0.38));
  const crossCount = Math.max(9, count - approachCount + 1);
  const approach = parabola([start.x, start.y], [bounce.x, bounce.y], bulge * 0.58, approachCount);
  const crossing = parabola([bounce.x, bounce.y], [end.x, end.y], bulge, crossCount);
  approach.forEach((point) => {
    point.lobe = 0;
  });
  crossing.forEach((point) => {
    point.lobe = 1;
  });
  const bouncePoint = approach[approach.length - 1];
  bouncePoint.bounce = true;
  bouncePoint.lift = 0;
  bouncePoint.lobe = 0;
  return [...approach.slice(0, -1), bouncePoint, ...crossing.slice(1)];
}

function bezier(values, t) {
  const n = values.length - 1;
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    acc += binom(n, i) * (1 - t) ** (n - i) * t ** i * values[i];
  }
  return acc;
}

function binom(n, k) {
  let v = 1;
  for (let i = 1; i <= k; i++) v = (v * (n - k + i)) / i;
  return v;
}

function resample(dense, count) {
  const lengths = [0];
  for (let i = 1; i < dense.length; i++) {
    lengths[i] =
      lengths[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
  }
  const total = lengths[lengths.length - 1];
  const points = [];
  for (let i = 0; i < count; i++) {
    const target = (total * i) / Math.max(1, count - 1);
    let k = 1;
    while (k < lengths.length - 1 && lengths[k] < target) k++;
    const span = lengths[k] - lengths[k - 1] || 1;
    const f = (target - lengths[k - 1]) / span;
    const from = dense[k - 1];
    const to = dense[k];
    points.push({
      x: from.x + (to.x - from.x) * f,
      y: from.y + (to.y - from.y) * f,
      gx: from.gx + (to.gx - from.gx) * f,
      gy: from.gy + (to.gy - from.gy) * f,
      v: from.v + (to.v - from.v) * f,
      lift: Math.max(0, from.lift + (to.lift - from.lift) * f),
      r: DOT,
    });
  }
  return points;
}

function flightProgress(time) {
  return time + 0.07 * Math.sin(Math.PI * 2 * time);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function composeRally() {
  const shotCount = 3 + Math.floor(Math.random() * 2);
  let far = Math.random() < 0.5;
  let landingU = rand(0.18, 0.82);
  const built = [];

  for (let i = 0; i < shotCount; i++) {
    const from = [clamp(landingU + rand(-0.05, 0.05), 0.1, 0.9), far ? rand(0.8, 0.94) : rand(0.05, 0.18)];
    far = !far;
    const to = [rand(0.12, 0.88), far ? rand(0.8, 0.94) : rand(0.05, 0.18)];
    const bend = rand(-0.36, 0.36);
    const controls = [
      from,
      [
        clamp(from[0] + (to[0] - from[0]) * 0.34 + bend * 0.5, 0.05, 0.95),
        clamp(from[1] + (to[1] - from[1]) * 0.34, 0.03, 0.97),
      ],
      [
        clamp(from[0] + (to[0] - from[0]) * 0.68 + bend, 0.05, 0.95),
        clamp(from[1] + (to[1] - from[1]) * 0.7, 0.03, 0.97),
      ],
      to,
    ];
    const span = Math.hypot(to[0] - from[0], (to[1] - from[1]) * 1.2);
    const narrow = window.matchMedia("(max-width: 540px)").matches;
    const count = Math.round(clamp(8 + span * (narrow ? 8 : 16), narrow ? 6 : 9, narrow ? 12 : 26));
    built.push(rally(controls, count, rand(0.78, 1)));
    landingU = to[0];
  }

  const durations = built.map(() => rand(0.9, 1.25));
  const gaps = built.slice(0, -1).map(() => rand(0.05, 0.12));
  const sum = durations.reduce((total, value) => total + value, 0) + gaps.reduce((total, value) => total + value, 0);
  const scale = 0.78 / sum;
  let cursor = 0.03;
  const windows = durations.map((duration, index) => {
    const span = duration * scale;
    const window = [cursor, cursor + span];
    cursor += span + (gaps[index] || 0) * scale;
    return window;
  });

  return { paths: built, windows };
}

let paths = [];
let pathWindows = [];
let dots = [];
let drawDots = [];
function putOpacity(node, record, key, value) {
  const next = value < 0.03 ? "0" : value > 0.97 ? "1" : value.toFixed(2);
  if (record[key] === next) return;
  record[key] = next;
  node.setAttribute("opacity", next);
}

function mountRally(nextPaths, nextWindows) {
  dots.forEach((dot) => dot.el.remove());
  drawDots.forEach((node) => node.remove());
  paths = nextPaths;
  pathWindows = nextWindows;
  dots = [];
  drawDots = [];

  nextPaths.forEach((path, pathIndex) => {
    const bounceIndex = path.findIndex((point) => point.bounce);
    const bounceAlong = bounceIndex < 0 ? 1 : bounceIndex / Math.max(1, path.length - 1);
    path.forEach((point, i) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", point.x.toFixed(1));
      circle.setAttribute("cy", point.y.toFixed(1));
      circle.setAttribute("r", point.r);
      circle.setAttribute("opacity", "0");
      trail.insertBefore(circle, ball);
      const echo = circle.cloneNode();
      echo.setAttribute("r", (point.r * drawnBallScale).toFixed(2));
      drawTrail.insertBefore(echo, drawBall);
      drawDots.push(echo);
      dots.push({
        el: circle,
        echo,
        r: point.r,
        pathIndex,
        along: i / Math.max(1, path.length - 1),
        lobe: point.lobe || 0,
        bounceAlong,
        opacity: "0",
        echoOpacity: "0",
      });
    });
  });
}

function makeShade() {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const gradient = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
  gradient.setAttribute("id", "ball-shade");
  gradient.setAttribute("cx", "34%");
  gradient.setAttribute("cy", "30%");
  gradient.setAttribute("r", "72%");
  [
    ["0%", "#ffffff"],
    ["58%", "#f3f4f6"],
    ["100%", "#c5c8ce"],
  ].forEach(([offset, color]) => {
    const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop.setAttribute("offset", offset);
    stop.setAttribute("stop-color", color);
    gradient.appendChild(stop);
  });
  defs.appendChild(gradient);
  return defs;
}

function makeBall() {
  const ball = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  ball.setAttribute("class", "ball");
  ball.setAttribute("r", DOT + 3);
  ball.style.visibility = "hidden";
  return ball;
}

function makeShadow() {
  const shadow = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  shadow.setAttribute("class", "shadow");
  shadow.style.visibility = "hidden";
  return shadow;
}

trail.prepend(makeShade());
const shadow = makeShadow();
const drawShadow = makeShadow();
const ball = makeBall();
const drawBall = makeBall();
let drawnBallScale = 1;

function syncDrawnBall() {
  const home = document.querySelector(".table").getBoundingClientRect();
  const box = drawn.getBoundingClientRect();
  if (home.width < 1 || box.width < 1 || box.height < 1) return;
  const homeScale = home.width / 862;
  const drawnScale = Math.min(box.width / 862, box.height / 895);
  const homePx = (DOT + 3) * homeScale;
  const rawPx = (DOT + 3) * drawnScale;
  const targetPx = Math.min(homePx, Math.max(rawPx, homePx * 0.9));
  const maxPx = Math.min(box.width, box.height) * 0.06;
  const px = Math.max(6, Math.min(targetPx, maxPx));
  drawnBallScale = drawnScale > 0 ? px / rawPx : 1;
  drawBall.setAttribute("r", ((DOT + 3) * drawnBallScale).toFixed(2));
  dots.forEach((dot) => {
    dot.echo.setAttribute("r", (dot.r * drawnBallScale).toFixed(2));
  });
}
trail.append(shadow, ball);
drawTrail.append(drawShadow, drawBall);
const opening = composeRally();
mountRally(opening.paths, opening.windows);

function placeBall(node, shade, x, y, gx, gy, lift, opacity) {
  const contact = Math.min(1, lift / 0.2);
  const sy = 0.84 + 0.16 * contact;
  const sx = 1 / Math.sqrt(sy);
  node.setAttribute(
    "transform",
    `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`
  );
  node.setAttribute("opacity", opacity < 0.03 ? "0" : opacity.toFixed(2));

  shade.setAttribute("cx", gx.toFixed(1));
  shade.setAttribute("cy", (gy + 4).toFixed(1));
  const shadowScale = shade === drawShadow ? drawnBallScale : 1;
  shade.setAttribute("rx", ((8 + lift * 7) * shadowScale).toFixed(2));
  shade.setAttribute("ry", ((2.7 + lift * 1.3) * shadowScale).toFixed(2));
  const shadeOpacity = opacity * (0.28 + 0.3 * (1 - lift));
  shade.setAttribute("opacity", shadeOpacity < 0.03 ? "0" : shadeOpacity.toFixed(2));
}

let trailStart = performance.now();

function paintTrail(now) {
  if (now - trailStart >= RALLY_MS) {
    const next = composeRally();
    mountRally(next.paths, next.windows);
    trailStart = now;
  }

  const t = (now - trailStart) / RALLY_MS;
  const fade = t < 0.88 ? 1 : 1 - (t - 0.88) / 0.12;
  const homeOn = home.classList.contains("is-active");
  const drawStep = homeOn ? 1 : Math.max(1, Math.round(drawnBallScale * 1.15));

  dots.forEach((dot, index) => {
    const [a, b] = pathWindows[dot.pathIndex];
    const local = (t - a) / (b - a);
    const progress = local <= 0 || local >= 1 ? local : flightProgress(local);
    const appear = Math.min(
      1,
      Math.max(0, (progress - dot.along) * paths[dot.pathIndex].length * 0.85)
    );
    let haze = 1;
    if (dot.lobe === 0 && progress > dot.bounceAlong) {
      const passed = Math.min(1, (progress - dot.bounceAlong) / 0.2);
      haze = 1 - passed * 0.72;
    }
    const amount = appear * fade * haze;
    if (homeOn) putOpacity(dot.el, dot, "opacity", amount);
    else if (index % drawStep === 0) putOpacity(dot.echo, dot, "echoOpacity", amount);
    else putOpacity(dot.echo, dot, "echoOpacity", 0);
  });

  let active = null;
  pathWindows.forEach(([start, end], index) => {
    const local = (t - start) / (end - start);
    if (local >= 0 && local <= 1) active = { index, local };
  });

  if (active && fade > 0) {
    const path = paths[active.index];
    const progress = flightProgress(active.local);
    const distance = progress * (path.length - 1);
    const i0 = Math.min(path.length - 2, Math.floor(distance));
    const mix = distance - i0;
    const from = path[i0];
    const to = path[i0 + 1];
    const x = from.x + (to.x - from.x) * mix;
    const y = from.y + (to.y - from.y) * mix;
    const gx = from.gx + (to.gx - from.gx) * mix;
    const gy = from.gy + (to.gy - from.gy) * mix;
    const lift = from.lift + (to.lift - from.lift) * mix;
    if (homeOn) placeBall(ball, shadow, x, y, gx, gy, lift, fade);
    else placeBall(drawBall, drawShadow, x, y, gx, gy, lift, fade);
  } else if (homeOn) {
    placeBall(ball, shadow, 0, 0, 0, 0, 0, 0);
  } else {
    placeBall(drawBall, drawShadow, 0, 0, 0, 0, 0, 0);
  }

  requestAnimationFrame(paintTrail);
}

requestAnimationFrame(paintTrail);

function show(screen) {
  document.querySelectorAll(".screen").forEach((node) => {
    node.classList.toggle("is-active", node === screen);
  });
}

home.addEventListener("click", () => {
  resetDraw();
  show(draw);
});
back.addEventListener("click", () => show(home));

let drag = null;

draw.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".mark")) return;
  try {
    draw.setPointerCapture(event.pointerId);
  } catch (error) {}
  drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
});

draw.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const rect = rectFrom(drag.x, drag.y, event.clientX, event.clientY);
  if (rect.w < 36 || rect.h < 36) return;
  showOutline(rect);
});

draw.addEventListener("pointerup", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const rect = rectFrom(drag.x, drag.y, event.clientX, event.clientY);
  drag = null;
  if (rect.w < 36 || rect.h < 36) {
    preview.hidden = true;
    if (drawn.hidden) rest.classList.remove("is-hidden");
    return;
  }
  showFilled(rect);
});

draw.addEventListener("pointercancel", () => {
  drag = null;
  preview.hidden = true;
  if (drawn.hidden) rest.classList.remove("is-hidden");
});

function resetDraw() {
  preview.hidden = true;
  drawn.hidden = true;
  guide.hidden = true;
  readout.hidden = true;
  rest.classList.remove("is-hidden");
  showPortrait(null);
}

function rectFrom(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

const tableCorners = [
  [16, 870],
  [846, 786],
  [684, 14],
  [294, 104],
];

function paintSide(rect) {
  const forehand = readShot(rect.x, rect.y, rect.w, rect.h).label === "Forehand";
  previewShape.classList.toggle("is-forehand", forehand);
  drawn.classList.toggle("is-forehand", forehand);
}

function showOutline(rect) {
  drawn.hidden = true;
  guide.hidden = true;
  readout.hidden = true;
  showPortrait(null);
  rest.classList.add("is-hidden");
  preview.hidden = false;
  paintSide(rect);
  previewShape.setAttribute(
    "points",
    tableCorners
      .map(([px, py]) => {
        const point = place(px, py, rect.x, rect.y, rect.w, rect.h);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      })
      .join(" ")
  );
}

function showFilled(rect) {
  const { x, y, w, h } = rect;
  preview.hidden = true;
  drawn.hidden = false;
  guide.hidden = false;
  drawn.style.left = `${x}px`;
  drawn.style.top = `${y}px`;
  drawn.style.width = `${w}px`;
  drawn.style.height = `${h}px`;
  paintSide(rect);
  layoutGuide(x, y, w, h);

  const shot = readShot(rect.x, rect.y, rect.w, rect.h);
  readout.hidden = false;
  readout.textContent = "";
  if (shot.stacked) {
    readout.append(`${shot.pct.toFixed(1)}%`, document.createElement("br"), shot.label);
    readout.style.whiteSpace = "normal";
    readout.style.lineHeight = "1.05";
  } else {
    readout.textContent = `${shot.pct.toFixed(1)}% ${shot.label}`;
    readout.style.whiteSpace = "nowrap";
    readout.style.lineHeight = "1";
  }
  readout.style.textAlign = "center";
  readout.style.fontSize = `${shot.fontSize}px`;
  readout.style.color = shot.color;
  readout.style.left = `${shot.x}px`;
  readout.style.top = `${shot.y}px`;
  readout.style.transform = `translate(-50%, -50%) rotate(${shot.angle}deg)`;
  showPortrait(shot);
  syncDrawnBall();
}

function showPortrait(shot) {
  const reached = shot && shot.pct <= PORTRAIT_MAX;
  portraitJp.hidden = !(reached && shot.label === "Backhand");
  portraitUs.hidden = !(reached && shot.label === "Forehand");
}

window.addEventListener("resize", () => {
  if (!drawn.hidden) syncDrawnBall();
});

function layoutGuide(x, y, w, h) {
  const extend = 18;
  const segments = [
    [x - extend, y, x + w + extend, y],
    [x, y - extend, x, y + h + extend],
    [x + w, y - extend, x + w, y + h + extend],
    [x - extend, y + h, x + w + extend, y + h],
    [x - extend, y + h / 2, x + w + extend, y + h / 2],
  ];
  guideLines.forEach((line, index) => {
    const [x1, y1, x2, y2] = segments[index];
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
  });
}

function place(px, py, x, y, w, h) {
  return {
    x: x + (px / 862) * w,
    y: y + (py / 895) * h,
  };
}

function readShot(x, y, w, h) {
  const nearCx = x + w / 2;
  const mid = window.innerWidth / 2;
  const pos = Math.max(-1, Math.min(1, (mid - nearCx) / (window.innerWidth * 0.5)));
  const pct = Math.min(100, Math.abs(pos) * 100);
  const score = pos;
  const label = score >= 0 ? "Backhand" : "Forehand";

  const netA = place(186, 448, x, y, w, h);
  const netB = place(748, 350, x, y, w, h);
  const anchor = place(455, 430, x, y, w, h);
  const angle = (Math.atan2(netB.y - netA.y, netB.x - netA.x) * 180) / Math.PI;
  const compact = window.matchMedia("(max-width: 540px)").matches;
  const text = `${pct.toFixed(1)}% ${label}`;
  const face = faceSpan(430, w);
  const netLen = Math.hypot(netB.x - netA.x, netB.y - netA.y);
  const span = Math.min(face * 0.9, netLen * 0.78);
  let color = "#fff";
  let textAngle = Math.max(-24, Math.min(24, angle));
  let placeX = anchor.x;
  let placeY = anchor.y;
  let stacked = false;
  let fontSize = fitLabel(compact ? label : text, span);

  if (compact && w / Math.max(h, 1) > 0.28) {
    stacked = true;
    fontSize = Math.max(18, Math.min(32, fontSize));
  }

  if (w / Math.max(h, 1) <= 0.28) {
    textAngle = 0;
    color = "#000";
    const roomRight = window.innerWidth - (x + w);
    const roomLeft = x;
    const room = Math.max(roomRight, roomLeft) - 36;
    fontSize = Math.min(34, Math.max(20, h * 0.05), room / (measureLabel(text, 100) / 100));
    const estimated = measureLabel(text, fontSize);
    const gap = 22;
    placeX = roomRight >= roomLeft ? x + w + gap + estimated / 2 : x - gap - estimated / 2;
    placeX = Math.max(estimated / 2 + 8, Math.min(window.innerWidth - estimated / 2 - 8, placeX));
    placeY = Math.max(48, Math.min(window.innerHeight - 40, y + h / 2));
  }

  return {
    label,
    pct,
    angle: textAngle,
    fontSize,
    color,
    stacked,
    x: placeX,
    y: placeY,
  };
}

function faceSpan(imageY, w) {
  const left = edgeAt(294, 104, 16, 870, imageY);
  const right = edgeAt(684, 14, 846, 786, imageY);
  return ((right - left) / 862) * w;
}

function edgeAt(x0, y0, x1, y1, y) {
  const t = (y - y0) / (y1 - y0);
  return x0 + t * (x1 - x0);
}

function measureLabel(text, fontSize) {
  if (!measureLabel.ctx) {
    measureLabel.ctx = document.createElement("canvas").getContext("2d");
  }
  measureLabel.ctx.font = `400 ${fontSize}px ${getComputedStyle(readout).fontFamily}`;
  return measureLabel.ctx.measureText(text).width;
}

function fitLabel(text, span) {
  const widthAt = measureLabel(text, 40);
  if (!widthAt) return 16;
  return Math.max(11, Math.min(48, (span / widthAt) * 40));
}
