const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  shell: document.querySelector(".game-shell"),
  score: document.getElementById("score-label"),
  best: document.getElementById("best-label"),
  titleBest: document.getElementById("title-best-label"),
  lives: document.getElementById("lives-label"),
  status: document.getElementById("status-label"),
  effect: document.getElementById("effect-label"),
  toast: document.getElementById("toast"),
  flash: document.getElementById("screen-flash"),
  titleScreen: document.getElementById("title-screen"),
  readyScreen: document.getElementById("ready-screen"),
  pauseScreen: document.getElementById("pause-screen"),
  creditsScreen: document.getElementById("credits-screen"),
  gameOverScreen: document.getElementById("game-over-screen"),
  finalScore: document.getElementById("final-score-label"),
  start: document.getElementById("start-button"),
  go: document.getElementById("go-button"),
  pause: document.getElementById("pause-button"),
  music: document.getElementById("music-button"),
  quit: document.getElementById("quit-button"),
  resume: document.getElementById("resume-button"),
  credits: document.getElementById("credits-button"),
  creditsBack: document.getElementById("credits-back-button"),
  creditsPlay: document.getElementById("credits-play-button"),
  pauseQuit: document.getElementById("pause-quit-button"),
  retry: document.getElementById("retry-button"),
  gameOverQuit: document.getElementById("game-over-quit-button"),
  left: document.getElementById("left-button"),
  right: document.getElementById("right-button"),
};

const STORAGE_KEY = "cars-r-us-best";
const LANES = 3;
const MAX_LIVES = 5;
const INITIAL_LIVES = 3;
const MAX_FRAME_DELTA = 0.05;
const BASE_SPEED = 365;
const PLAYER_Y_RATIO = 0.79;
const VEHICLE_HEIGHT_SCALE = 0.68;
const PLAYER_LANE_PRESSURE_MIN = 0.74;
const PLAYER_LANE_PRESSURE_MAX = 0.96;

const vehicleModels = [
  { type: "compact", width: 0.5, height: 1.28, colors: ["#e53f4a", "#1876d2", "#f5c84c", "#2aa56d", "#f1f3f6"] },
  { type: "sedan", width: 0.56, height: 1.52, colors: ["#b7223c", "#1c5fb8", "#2f3643", "#e9ecef", "#ba7d2e"] },
  { type: "sports", width: 0.6, height: 1.38, colors: ["#f23b33", "#ffb000", "#202733", "#734bff", "#00a7a8"] },
  { type: "suv", width: 0.68, height: 1.72, colors: ["#38495d", "#0e8b7f", "#c94835", "#e5e8ec", "#5a6470"] },
  { type: "van", width: 0.7, height: 1.92, colors: ["#f2f5f6", "#4577b9", "#cc523f", "#71818e", "#e3b64b"] },
  { type: "pickup", width: 0.66, height: 1.82, colors: ["#26445e", "#be3d35", "#dcd6c4", "#3e9360", "#525a66"] },
  { type: "truck", width: 0.76, height: 2.25, colors: ["#e9eef4", "#df3d32", "#24384c", "#d99b36", "#57636f"] },
  { type: "taxi", width: 0.58, height: 1.5, colors: ["#f3bd25"] },
  { type: "police", width: 0.58, height: 1.54, colors: ["#eff3f7"] },
];

const powerups = ["shield", "life", "turbo", "clear"];
const hazards = ["puddle", "breaker", "oil"];
const particles = [];

const music = {
  context: null,
  master: null,
  compressor: null,
  noiseBuffer: null,
  scheduler: null,
  enabled: true,
  supported: true,
  step: 0,
  nextStepAt: 0,
  tempo: 136,
  lookAhead: 0.14,
  volume: 0.24,
};

const game = {
  mode: "title",
  score: 0,
  best: Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10),
  lives: INITIAL_LIVES,
  time: 0,
  distance: 0,
  roadSpeed: BASE_SPEED,
  spawnTimer: 0,
  powerTimer: 3.2,
  hazardTimer: 2.4,
  toastTimer: 0,
  shieldUntil: 0,
  slowUntil: 0,
  turboUntil: 0,
  invincibleUntil: 0,
  steeringLockUntil: 0,
  shake: 0,
  titlePulse: 0,
  escapeLane: 1,
  entities: [],
};

const player = {
  lane: 1,
  visualLane: 1,
  wobble: 0,
};

const view = {
  width: 1,
  height: 1,
  dpr: 1,
  horizon: 100,
  bottom: 800,
  center: 400,
  topWidth: 270,
  bottomWidth: 820,
};

let roadPattern = null;
let lastFrame = performance.now();
let entityId = 0;
let randomSeed = 20260423;

function seededRandom() {
  randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
  return randomSeed / 4294967296;
}

function randomRange(min, max) {
  return min + (max - min) * seededRandom();
}

function choose(items) {
  return items[Math.floor(seededRandom() * items.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function easeOut(value) {
  return 1 - Math.pow(1 - value, 2.2);
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const scale = Math.abs(amount);
  const nr = Math.round(lerp(r, target, scale));
  const ng = Math.round(lerp(g, target, scale));
  const nb = Math.round(lerp(b, target, scale));
  return `rgb(${nr}, ${ng}, ${nb})`;
}

function audioContextClass() {
  return window.AudioContext || window.webkitAudioContext;
}

function ensureMusic() {
  if (music.context || !music.supported) {
    return music.context;
  }

  const AudioContext = audioContextClass();
  if (!AudioContext) {
    music.supported = false;
    updateMusicUi();
    return null;
  }

  const context = new AudioContext();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();

  master.gain.value = music.volume;
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;
  master.connect(compressor);
  compressor.connect(context.destination);

  music.context = context;
  music.master = master;
  music.compressor = compressor;
  music.noiseBuffer = createNoiseBuffer(context);
  return context;
}

function createNoiseBuffer(context) {
  const length = Math.floor(context.sampleRate * 0.18);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i += 1) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * fade;
  }

  return buffer;
}

function updateMusicUi() {
  if (!ui.music) {
    return;
  }

  const active = music.enabled && music.supported;
  ui.music.disabled = !music.supported;
  ui.music.textContent = active ? "Music" : "Muted";
  ui.music.classList.toggle("music-on", active);
  ui.music.classList.toggle("music-off", !active);
  ui.music.setAttribute("aria-pressed", active ? "true" : "false");
}

function syncMusicToMode() {
  if ((game.mode === "ready" || game.mode === "running") && music.enabled) {
    startMusic();
  } else {
    pauseMusic();
  }
  updateMusicUi();
}

function startMusic() {
  if (!music.enabled) {
    updateMusicUi();
    return;
  }

  const context = ensureMusic();
  if (!context) {
    return;
  }

  const beginLoop = () => {
    if (game.mode !== "ready" && game.mode !== "running") {
      return;
    }

    if (music.master) {
      music.master.gain.cancelScheduledValues(context.currentTime);
      music.master.gain.setTargetAtTime(music.volume, context.currentTime, 0.025);
    }

    if (!music.scheduler) {
      music.nextStepAt = context.currentTime + 0.03;
      music.scheduler = window.setInterval(scheduleMusic, 25);
      scheduleMusic();
    }

    updateMusicUi();
  };

  if (context.state === "suspended") {
    context.resume().then(beginLoop).catch(() => {
      if (context.state === "running") {
        beginLoop();
      }
    });
  } else {
    beginLoop();
  }
}

function pauseMusic() {
  if (music.scheduler) {
    window.clearInterval(music.scheduler);
    music.scheduler = null;
  }

  if (music.context && music.master) {
    music.master.gain.cancelScheduledValues(music.context.currentTime);
    music.master.gain.setTargetAtTime(0.0001, music.context.currentTime, 0.035);
  }

  if (music.context && music.context.state === "running") {
    window.setTimeout(() => {
      if (game.mode !== "ready" && game.mode !== "running" && music.context?.state === "running") {
        music.context.suspend().catch(() => {});
      }
    }, 90);
  }

  updateMusicUi();
}

function toggleMusic() {
  music.enabled = !music.enabled;

  if (music.enabled) {
    showToast("Music on", 0.75);
    syncMusicToMode();
  } else {
    pauseMusic();
    showToast("Music off", 0.75);
  }

  updateMusicUi();
  canvas.focus();
}

function scheduleMusic() {
  if (!music.context || !music.master) {
    return;
  }

  const stepDuration = 60 / music.tempo / 2;
  while (music.nextStepAt < music.context.currentTime + music.lookAhead) {
    scheduleMusicStep(music.step, music.nextStepAt);
    music.step = (music.step + 1) % 32;
    music.nextStepAt += stepDuration;
  }
}

function scheduleMusicStep(step, time) {
  const bar = Math.floor(step / 8) % 4;
  const roots = [36, 43, 46, 41];
  const chords = [
    [48, 55, 60, 63],
    [43, 55, 58, 62],
    [46, 53, 58, 62],
    [41, 53, 56, 60],
  ];

  if (step % 2 === 0) {
    const jump = step % 8 === 6 ? 12 : 0;
    scheduleTone(roots[bar] + jump, time, 0.16, "sawtooth", 0.54, 420);
  }

  const chord = chords[bar];
  const arpNote = chord[(step + bar) % chord.length] + 12;
  scheduleTone(arpNote, time + 0.01, step % 4 === 3 ? 0.16 : 0.1, "square", 0.24, 2200);

  if (step % 8 === 7) {
    scheduleTone(chord[3] + 24, time + 0.02, 0.09, "triangle", 0.16, 2800);
  }

  if (step % 4 === 0) {
    scheduleKick(time);
  }

  if (step % 4 === 2) {
    scheduleNoiseHit(time, 0.035, 0.08, "highpass", 5200);
  }

  if (step % 8 === 4) {
    scheduleNoiseHit(time, 0.11, 0.2, "bandpass", 1700);
  }
}

function midiToFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function scheduleTone(note, time, duration, type, level, filterFrequency) {
  const context = music.context;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(midiToFrequency(note), time);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterFrequency, time);
  filter.Q.setValueAtTime(type === "square" ? 7 : 2, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(level, time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(music.master);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.04);
}

function scheduleKick(time) {
  const context = music.context;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(118, time);
  oscillator.frequency.exponentialRampToValueAtTime(46, time + 0.16);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.62, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);

  oscillator.connect(gain);
  gain.connect(music.master);
  oscillator.start(time);
  oscillator.stop(time + 0.22);
}

function scheduleNoiseHit(time, duration, level, filterType, filterFrequency) {
  const context = music.context;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = music.noiseBuffer;
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFrequency, time);
  filter.Q.setValueAtTime(6, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(level, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(music.master);
  source.start(time);
  source.stop(time + duration + 0.02);
}

function setMode(mode) {
  game.mode = mode;
  ui.shell.dataset.mode = mode;
  ui.titleScreen.hidden = mode !== "title";
  ui.readyScreen.hidden = mode !== "ready";
  ui.pauseScreen.hidden = mode !== "paused";
  ui.creditsScreen.hidden = mode !== "credits";
  ui.gameOverScreen.hidden = mode !== "gameover";
  ui.pause.textContent = mode === "paused" ? "Play" : "Pause";
  updateUi();
  syncMusicToMode();
}

function showToast(message, duration = 1.2) {
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");
  game.toastTimer = duration;
}

function flashScreen() {
  ui.flash.classList.add("hit");
  window.setTimeout(() => ui.flash.classList.remove("hit"), 90);
}

function updateUi() {
  const score = Math.floor(game.score);
  ui.score.textContent = score.toLocaleString();
  ui.best.textContent = game.best.toLocaleString();
  ui.titleBest.textContent = game.best.toLocaleString();
  ui.lives.textContent = String(game.lives);
  ui.finalScore.textContent = score.toLocaleString();
  ui.shell.classList.toggle("shielded", game.shieldUntil > game.time);

  if (game.mode === "title") {
    ui.status.textContent = "Ready";
    ui.effect.textContent = "Ready";
    return;
  }

  if (game.mode === "paused") {
    ui.status.textContent = "Paused";
    return;
  }

  if (game.mode === "credits") {
    ui.status.textContent = "Credits";
    ui.effect.textContent = "Paused";
    return;
  }

  if (game.mode === "gameover") {
    ui.status.textContent = "Done";
    ui.effect.textContent = "Game Over";
    return;
  }

  const active = [];
  if (game.shieldUntil > game.time) {
    active.push("Shield");
  }
  if (game.turboUntil > game.time) {
    active.push("Turbo");
  }
  if (game.slowUntil > game.time) {
    active.push("Slow");
  }
  if (game.steeringLockUntil > game.time) {
    active.push("Slick");
  }

  ui.status.textContent = game.mode === "ready" ? "Ready" : "Driving";
  ui.effect.textContent = active.length ? active.join(" + ") : "Clear Road";
}

function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.width = window.innerWidth;
  view.height = window.innerHeight;
  canvas.width = Math.floor(view.width * view.dpr);
  canvas.height = Math.floor(view.height * view.dpr);
  canvas.style.width = `${view.width}px`;
  canvas.style.height = `${view.height}px`;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

  view.center = view.width / 2;
  view.horizon = Math.max(96, view.height * 0.16);
  view.bottom = view.height * 1.02;
  view.topWidth = clamp(view.width * 0.52, 230, 480);
  view.bottomWidth = clamp(view.width * 0.76, 340, 760);
  roadPattern = createRoadPattern();
}

function createRoadPattern() {
  const texture = document.createElement("canvas");
  texture.width = 220;
  texture.height = 220;
  const textureContext = texture.getContext("2d");
  textureContext.fillStyle = "#252d38";
  textureContext.fillRect(0, 0, texture.width, texture.height);

  for (let i = 0; i < 1300; i += 1) {
    const alpha = randomRange(0.035, 0.16);
    const gray = Math.floor(randomRange(82, 178));
    textureContext.fillStyle = `rgba(${gray}, ${gray}, ${gray}, ${alpha})`;
    textureContext.fillRect(randomRange(0, texture.width), randomRange(0, texture.height), randomRange(1, 3), randomRange(1, 3));
  }

  for (let i = 0; i < 24; i += 1) {
    textureContext.strokeStyle = `rgba(8, 12, 18, ${randomRange(0.08, 0.18)})`;
    textureContext.lineWidth = randomRange(0.6, 1.4);
    textureContext.beginPath();
    let x = randomRange(0, texture.width);
    let y = randomRange(0, texture.height);
    textureContext.moveTo(x, y);
    for (let j = 0; j < 3; j += 1) {
      x += randomRange(-18, 18);
      y += randomRange(10, 28);
      textureContext.lineTo(x, y);
    }
    textureContext.stroke();
  }

  for (let y = 0; y < texture.height; y += 18) {
    textureContext.fillStyle = "rgba(255, 255, 255, 0.018)";
    textureContext.fillRect(0, y, texture.width, 1);
  }

  return ctx.createPattern(texture, "repeat");
}

function roadProgress(y) {
  return clamp((y - view.horizon) / (view.bottom - view.horizon), 0, 1);
}

function roadWidthAt(y) {
  return lerp(view.topWidth, view.bottomWidth, Math.pow(roadProgress(y), 0.95));
}

function roadLeftAt(y) {
  return view.center - roadWidthAt(y) / 2;
}

function roadRightAt(y) {
  return view.center + roadWidthAt(y) / 2;
}

function laneWidthAt(y) {
  return roadWidthAt(y) / LANES;
}

function xForLane(lane, y) {
  return roadLeftAt(y) + laneWidthAt(y) * (lane + 0.5);
}

function playerY() {
  return view.height * PLAYER_Y_RATIO;
}

function playerDimensions() {
  const laneWidth = laneWidthAt(playerY());
  const width = clamp(laneWidth * 0.31, 28, 52);
  return { width, height: width * 1.16 };
}

function dimensionsForEntity(entity) {
  const laneWidth = laneWidthAt(entity.y);
  const scale = lerp(0.56, 0.78, easeOut(roadProgress(entity.y)));

  if (entity.kind === "traffic") {
    const width = clamp(laneWidth * entity.model.width * scale * 0.68, 18, laneWidth * 0.5);
    return { width, height: width * entity.model.height * VEHICLE_HEIGHT_SCALE };
  }

  if (entity.kind === "power") {
    const size = clamp(laneWidth * 0.2 * scale, 14, 30);
    return { width: size, height: size };
  }

  const width = clamp(laneWidth * (entity.subtype === "puddle" ? 0.38 : 0.28) * scale, 16, laneWidth * 0.44);
  return { width, height: width * (entity.subtype === "oil" ? 0.52 : 0.36) };
}

function resetGame() {
  randomSeed = 20260423 + Math.floor(Date.now() % 100000);
  game.score = 0;
  game.lives = INITIAL_LIVES;
  game.time = 0;
  game.distance = 0;
  game.roadSpeed = BASE_SPEED;
  game.spawnTimer = 0.35;
  game.powerTimer = 2.9;
  game.hazardTimer = 2.2;
  game.toastTimer = 0;
  game.shieldUntil = 0;
  game.slowUntil = 0;
  game.turboUntil = 0;
  game.invincibleUntil = 0;
  game.steeringLockUntil = 0;
  game.shake = 0;
  game.escapeLane = 1;
  game.entities.length = 0;
  particles.length = 0;
  player.lane = 1;
  player.visualLane = 1;
  player.wobble = 0;
  setMode("ready");
  showToast("Ready", 0.6);
  updateUi();
}

function startGame() {
  resetGame();
  canvas.focus();
}

function goGame() {
  if (game.mode !== "ready") {
    return;
  }
  setMode("running");
  showToast("GO!", 0.55);
  canvas.focus();
}

function togglePause() {
  if (game.mode === "running") {
    setMode("paused");
    showToast("Paused", 0.7);
  } else if (game.mode === "paused") {
    setMode("running");
    showToast("Drive", 0.55);
    canvas.focus();
  }
}

function showCredits() {
  if (game.mode !== "paused") {
    return;
  }
  setMode("credits");
}

function backToPause() {
  if (game.mode !== "credits") {
    return;
  }
  setMode("paused");
}

function playFromCredits() {
  if (game.mode !== "credits") {
    return;
  }
  setMode("running");
  showToast("Drive", 0.55);
  canvas.focus();
}

function quitGame() {
  setMode("title");
  game.entities.length = 0;
  particles.length = 0;
  game.titlePulse = 0;
  updateUi();
}

function gameOver() {
  game.best = Math.max(game.best, Math.floor(game.score));
  localStorage.setItem(STORAGE_KEY, String(game.best));
  setMode("gameover");
  showToast("Game Over", 1.4);
  flashScreen();
  updateUi();
}

function moveLane(direction) {
  if (game.mode !== "running" && game.mode !== "ready") {
    return;
  }

  if (game.steeringLockUntil > game.time) {
    player.wobble = direction * 0.55;
    return;
  }

  const nextLane = clamp(player.lane + direction, 0, LANES - 1);
  if (nextLane !== player.lane) {
    player.lane = nextLane;
    player.wobble = direction * 0.35;
    spawnLaneDust(direction);
  }
}

function makeTraffic(lane, y = -randomRange(84, 160)) {
  const model = choose(vehicleModels);
  const color = choose(model.colors);
  const traffic = {
    id: entityId,
    kind: "traffic",
    model,
    color,
    lane,
    y,
    vy: randomRange(80, 190) * (model.type === "truck" ? 0.72 : 1),
    shine: seededRandom(),
    scored: false,
  };
  entityId += 1;
  game.entities.push(traffic);
}

function spawnTrafficWave(difficulty) {
  const safeLane = chooseEscapeLane(difficulty);
  const blockedLanes = [0, 1, 2].filter((lane) => lane !== safeLane);
  const hardChance = game.time < 4 ? 0.18 : clamp(0.18 + difficulty * 0.14, 0.28, 0.66);
  const blockCount = seededRandom() < hardChance ? 2 : 1;
  const laneOrder = trafficLaneOrder(blockedLanes, difficulty);
  const baseY = -randomRange(92, 168);

  game.escapeLane = safeLane;

  for (let i = 0; i < blockCount; i += 1) {
    makeTraffic(laneOrder[i], baseY - i * randomRange(5, 18));
  }
}

function chooseEscapeLane(difficulty) {
  if (game.time < 3.2) {
    return 1;
  }

  const candidates = [game.escapeLane, game.escapeLane - 1, game.escapeLane + 1]
    .filter((lane) => lane >= 0 && lane < LANES)
    .filter((lane) => laneIsClearForEscape(lane));
  const reachableCandidates = candidates.filter((lane) => Math.abs(lane - player.lane) <= 1);
  const safeCandidates = reachableCandidates.length ? reachableCandidates : candidates;
  const pressureChance = clamp(PLAYER_LANE_PRESSURE_MIN + difficulty * 0.08, 0.8, PLAYER_LANE_PRESSURE_MAX);
  const pressureCandidates = safeCandidates.filter((lane) => lane !== player.lane);

  if (pressureCandidates.length > 0 && seededRandom() < pressureChance) {
    return choose(pressureCandidates);
  }

  const shouldShift = seededRandom() < clamp(0.2 + difficulty * 0.11, 0.24, 0.62);
  const shifted = safeCandidates.filter((lane) => lane !== game.escapeLane);

  if (shouldShift && shifted.length > 0) {
    return choose(shifted);
  }

  return safeCandidates.includes(game.escapeLane) ? game.escapeLane : (safeCandidates[0] ?? game.escapeLane);
}

function laneIsClearForEscape(lane) {
  const dangerY = playerY() + playerDimensions().height * 0.75;
  return !game.entities.some((entity) => (
    entity.kind === "traffic" &&
    entity.lane === lane &&
    entity.y < dangerY
  ));
}

function shuffledLanes(sourceLanes) {
  const lanes = [...sourceLanes];
  for (let i = lanes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(seededRandom() * (i + 1));
    const tmp = lanes[i];
    lanes[i] = lanes[j];
    lanes[j] = tmp;
  }
  return lanes;
}

function trafficLaneOrder(blockedLanes, difficulty) {
  const lanes = shuffledLanes(blockedLanes);
  const playerLaneIndex = lanes.indexOf(player.lane);
  const pressureChance = clamp(PLAYER_LANE_PRESSURE_MIN + difficulty * 0.1, 0.84, PLAYER_LANE_PRESSURE_MAX);

  if (playerLaneIndex > 0 && seededRandom() < pressureChance) {
    lanes.splice(playerLaneIndex, 1);
    lanes.unshift(player.lane);
  }

  return lanes;
}

function makePowerup() {
  game.entities.push({
    id: entityId,
    kind: "power",
    subtype: choose(powerups),
    lane: Math.floor(seededRandom() * LANES),
    y: -randomRange(70, 190),
    bob: seededRandom() * Math.PI * 2,
  });
  entityId += 1;
}

function makeHazard() {
  const subtype = choose(hazards);
  const lanes = [0, 1, 2].filter((lane) => lane !== game.escapeLane && lane !== player.lane);
  game.entities.push({
    id: entityId,
    kind: "hazard",
    subtype,
    lane: lanes.length ? choose(lanes) : (game.escapeLane + 1) % LANES,
    y: -randomRange(70, 180),
    wobble: seededRandom() * Math.PI * 2,
  });
  entityId += 1;
}

function spawnLaneDust(direction) {
  const dims = playerDimensions();
  const y = playerY() + dims.height * 0.26;
  const x = xForLane(player.visualLane, y);
  for (let i = 0; i < 8; i += 1) {
    particles.push({
      x: x - direction * randomRange(4, dims.width * 0.45),
      y: y + randomRange(-8, 12),
      vx: -direction * randomRange(22, 72),
      vy: randomRange(15, 80),
      life: randomRange(0.25, 0.5),
      maxLife: 0.5,
      size: randomRange(3, 7),
      color: "rgba(210, 222, 226, 0.76)",
    });
  }
}

function spawnImpact(x, y, color) {
  for (let i = 0; i < 24; i += 1) {
    const angle = randomRange(0, Math.PI * 2);
    const speed = randomRange(70, 260);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randomRange(0.35, 0.85),
      maxLife: 0.85,
      size: randomRange(3, 9),
      color,
    });
  }
}

function update(dt) {
  game.titlePulse += dt;

  if (game.mode !== "running") {
    updatePlayerVisual(dt);
    updateParticles(dt, 0);
    handleToast(dt);
    return;
  }

  game.time += dt;
  const difficulty = clamp(1 + game.time / 58 + game.score / 18000, 1, 3.7);
  const slow = game.slowUntil > game.time ? 0.72 : 1;
  const turbo = game.turboUntil > game.time ? 1.12 : 1;
  game.roadSpeed = (BASE_SPEED + difficulty * 42) * slow * turbo;
  game.distance += game.roadSpeed * dt;
  game.score += game.roadSpeed * dt * (game.turboUntil > game.time ? 0.19 : 0.105);

  updatePlayerVisual(dt);
  spawnEntities(dt, difficulty);
  updateEntities(dt);
  updateParticles(dt, game.roadSpeed);
  game.shake = Math.max(0, game.shake - dt * 18);
  handleToast(dt);
  updateUi();
}

function updatePlayerVisual(dt) {
  const normalRate = game.slowUntil > game.time ? 4.8 : 9.5;
  const rate = game.turboUntil > game.time ? 13.5 : normalRate;
  player.visualLane = lerp(player.visualLane, player.lane, clamp(dt * rate, 0, 1));
  player.wobble = lerp(player.wobble, 0, clamp(dt * 7, 0, 1));
}

function spawnEntities(dt, difficulty) {
  game.spawnTimer -= dt;
  game.powerTimer -= dt;
  game.hazardTimer -= dt;

  if (game.spawnTimer <= 0) {
    spawnTrafficWave(difficulty);
    const waveGap = randomRange(0.84, 1.24) / clamp(0.85 + difficulty * 0.08, 0.9, 1.14);
    game.spawnTimer = Math.max(0.72, waveGap);
  }

  if (game.powerTimer <= 0) {
    makePowerup();
    game.powerTimer = randomRange(5.8, 8.8);
  }

  if (game.hazardTimer <= 0) {
    makeHazard();
    game.hazardTimer = randomRange(3.7, 6.2) / clamp(difficulty * 0.52, 0.7, 1.65);
  }
}

function updateEntities(dt) {
  for (const entity of game.entities) {
    if (entity.kind === "traffic") {
      entity.y += (game.roadSpeed + entity.vy) * dt;
      const dims = dimensionsForEntity(entity);
      if (!entity.scored && entity.y - dims.height * 0.5 > playerY() + playerDimensions().height * 0.5) {
        entity.scored = true;
        game.score += 48 + Math.floor(dims.height * 0.25);
      }
    } else {
      entity.y += game.roadSpeed * dt;
      entity.bob = (entity.bob || 0) + dt * 4;
      entity.wobble = (entity.wobble || 0) + dt * 5;
    }
  }

  checkCollisions();
  game.entities = game.entities.filter((entity) => !entity.remove && entity.y < view.height + 180);
}

function handleToast(dt) {
  if (game.toastTimer > 0) {
    game.toastTimer -= dt;
    if (game.toastTimer <= 0) {
      ui.toast.classList.remove("visible");
    }
  }
}

function updateParticles(dt, roadSpeed) {
  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += (particle.vy + roadSpeed * 0.3) * dt;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.life -= dt;
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function boundsForPlayer() {
  const dims = playerDimensions();
  const y = playerY();
  const x = xForLane(player.lane, y);
  return {
    x,
    y,
    width: dims.width * 0.68,
    height: dims.height * 0.76,
  };
}

function boundsForEntity(entity) {
  const dims = dimensionsForEntity(entity);
  return {
    x: xForLane(entity.lane, entity.y),
    y: entity.y,
    width: dims.width * (entity.kind === "traffic" ? 0.74 : 0.82),
    height: dims.height * (entity.kind === "traffic" ? 0.78 : 0.82),
  };
}

function boxesOverlap(a, b) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) * 0.5 &&
    Math.abs(a.y - b.y) < (a.height + b.height) * 0.5
  );
}

function checkCollisions() {
  const playerBounds = boundsForPlayer();

  for (const entity of game.entities) {
    if (entity.remove || !boxesOverlap(playerBounds, boundsForEntity(entity))) {
      continue;
    }

    if (entity.kind === "traffic") {
      hitTraffic(entity);
    } else if (entity.kind === "power") {
      collectPowerup(entity);
    } else if (entity.kind === "hazard") {
      hitHazard(entity);
    }
  }
}

function hitTraffic(entity) {
  if (game.invincibleUntil > game.time) {
    return;
  }

  const x = xForLane(entity.lane, entity.y);
  if (game.shieldUntil > game.time) {
    game.shieldUntil = 0;
    game.invincibleUntil = game.time + 1.1;
    entity.remove = true;
    game.score += 120;
    game.shake = 5;
    spawnImpact(x, entity.y, "rgba(61, 224, 223, 0.82)");
    showToast("Shield held", 0.85);
    return;
  }

  game.lives -= 1;
  game.invincibleUntil = game.time + 1.35;
  entity.remove = true;
  game.shake = 12;
  spawnImpact(x, entity.y, "rgba(238, 57, 77, 0.8)");
  flashScreen();

  if (game.lives <= 0) {
    game.lives = 0;
    gameOver();
  } else {
    showToast("Life lost", 0.9);
  }
}

function collectPowerup(entity) {
  entity.remove = true;
  const x = xForLane(entity.lane, entity.y);
  spawnImpact(x, entity.y, "rgba(255, 212, 95, 0.84)");

  if (entity.subtype === "shield") {
    game.shieldUntil = game.time + 10;
    showToast("Shield on", 1);
  } else if (entity.subtype === "life") {
    game.lives = Math.min(MAX_LIVES, game.lives + 1);
    showToast("Extra life", 1);
  } else if (entity.subtype === "turbo") {
    game.turboUntil = game.time + 7.5;
    game.score += 240;
    showToast("Turbo score", 1);
  } else if (entity.subtype === "clear") {
    clearRoad();
    showToast("Road cleared", 1);
  }
}

function clearRoad() {
  let cleared = 0;
  const y = playerY();
  for (const entity of game.entities) {
    if (entity.kind === "traffic" && entity.y < y + 60) {
      entity.remove = true;
      cleared += 1;
      spawnImpact(xForLane(entity.lane, entity.y), entity.y, "rgba(255, 255, 255, 0.7)");
    }
  }
  game.score += cleared * 140;
}

function hitHazard(entity) {
  entity.remove = true;
  const x = xForLane(entity.lane, entity.y);

  if (entity.subtype === "puddle") {
    game.slowUntil = game.time + 4.4;
    player.wobble = randomRange(-0.45, 0.45);
    spawnImpact(x, entity.y, "rgba(70, 170, 220, 0.7)");
    showToast("Puddle slow", 0.9);
    return;
  }

  if (entity.subtype === "breaker") {
    if (game.shieldUntil > game.time) {
      game.shieldUntil = 0;
      showToast("Shield removed", 0.9);
    } else {
      game.steeringLockUntil = game.time + 0.95;
      showToast("Controls jammed", 0.9);
    }
    spawnImpact(x, entity.y, "rgba(145, 87, 255, 0.78)");
    return;
  }

  game.steeringLockUntil = game.time + 1.2;
  player.wobble = randomRange(-0.75, 0.75);
  spawnImpact(x, entity.y, "rgba(20, 24, 28, 0.58)");
  showToast("Oil slick", 0.9);
}

function draw() {
  const shakeX = game.shake > 0 ? Math.sin(game.time * 42) * game.shake : 0;
  const shakeY = game.shake > 0 ? Math.cos(game.time * 37) * game.shake * 0.55 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground();
  drawRoad();
  drawEntities();
  drawPlayer();
  drawParticles();
  drawVignette();
  ctx.restore();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, "#8bdcf2");
  sky.addColorStop(0.38, "#d8eff0");
  sky.addColorStop(0.74, "#8fc276");
  sky.addColorStop(1, "#5a994f");
  ctx.fillStyle = sky;
  ctx.fillRect(-30, -30, view.width + 60, view.height + 60);

  drawSun();
  drawSkyline();
  drawRoadside();
}

function drawSun() {
  const x = view.width * 0.78;
  const y = view.height * 0.13;
  const radius = clamp(view.width * 0.045, 28, 56);
  const glow = ctx.createRadialGradient(x, y, 6, x, y, radius * 2.6);
  glow.addColorStop(0, "rgba(255, 247, 199, 0.95)");
  glow.addColorStop(0.38, "rgba(255, 212, 95, 0.45)");
  glow.addColorStop(1, "rgba(255, 212, 95, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff0a6";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkyline() {
  const baseY = view.horizon + 16;
  const buildingCount = Math.ceil(view.width / 58);
  for (let i = 0; i < buildingCount; i += 1) {
    const width = 36 + (i % 4) * 13;
    const height = 34 + ((i * 29) % 68);
    const x = i * 58 - 24;
    const tone = 178 + ((i * 17) % 36);
    ctx.fillStyle = `rgba(${tone}, ${tone + 9}, ${tone + 18}, 0.42)`;
    ctx.fillRect(x, baseY - height, width, height);
    ctx.fillStyle = "rgba(255, 244, 178, 0.32)";
    for (let wy = baseY - height + 9; wy < baseY - 8; wy += 15) {
      for (let wx = x + 8; wx < x + width - 8; wx += 14) {
        ctx.fillRect(wx, wy, 4, 5);
      }
    }
  }
}

function drawRoadside() {
  const offset = (game.distance * 0.34) % 108;
  for (let side = -1; side <= 1; side += 2) {
    for (let y = view.horizon + ((-offset + 108) % 108); y < view.height + 150; y += 108) {
      const progress = roadProgress(y);
      const roadEdge = side < 0 ? roadLeftAt(y) : roadRightAt(y);
      const scale = lerp(0.58, 1.72, progress);
      const x = roadEdge + side * lerp(42, 118, progress);
      drawTree(x, y, scale);
    }
  }
}

function drawTree(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const trunkGradient = ctx.createLinearGradient(-5, -34, 5, 12);
  trunkGradient.addColorStop(0, "#7a5433");
  trunkGradient.addColorStop(0.45, "#54351f");
  trunkGradient.addColorStop(1, "#3a2418");
  ctx.fillStyle = trunkGradient;
  roundedRect(-5, -34, 10, 46, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(30, 18, 12, 0.32)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-1, -31);
  ctx.lineTo(-3, 4);
  ctx.moveTo(3, -27);
  ctx.lineTo(1, 10);
  ctx.stroke();

  const canopyGradient = ctx.createRadialGradient(-10, -62, 8, 0, -50, 39);
  canopyGradient.addColorStop(0, "#6cc46f");
  canopyGradient.addColorStop(0.35, "#2f9156");
  canopyGradient.addColorStop(1, "#17653d");
  ctx.fillStyle = canopyGradient;
  ctx.beginPath();
  ctx.ellipse(0, -50, 29, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(129, 211, 121, 0.7)";
  ctx.beginPath();
  ctx.ellipse(-10, -61, 12, 15, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(8, 52, 31, 0.22)";
  ctx.beginPath();
  ctx.ellipse(9, -37, 15, 19, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRoad() {
  const gradient = ctx.createLinearGradient(0, view.horizon, 0, view.height);
  gradient.addColorStop(0, "#3e4651");
  gradient.addColorStop(0.58, "#2a313c");
  gradient.addColorStop(1, "#1d232c");

  ctx.save();
  roadPath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.clip();

  ctx.globalAlpha = 0.55;
  if (roadPattern) {
    ctx.fillStyle = roadPattern;
    ctx.translate(0, (game.distance * 0.38) % 220);
    ctx.fillRect(-view.width, -240, view.width * 3, view.height + 480);
    ctx.translate(0, -((game.distance * 0.38) % 220));
  }
  ctx.globalAlpha = 1;

  drawLaneMarkers();
  drawRoadGloss();
  ctx.restore();

  drawShoulderLines();
}

function roadPath() {
  ctx.beginPath();
  ctx.moveTo(roadLeftAt(view.horizon), view.horizon);
  ctx.lineTo(roadRightAt(view.horizon), view.horizon);
  ctx.lineTo(roadRightAt(view.bottom), view.bottom);
  ctx.lineTo(roadLeftAt(view.bottom), view.bottom);
  ctx.closePath();
}

function drawLaneMarkers() {
  const spacing = 94;
  const offset = game.distance % spacing;
  for (let y = view.horizon - spacing + offset; y < view.height + spacing; y += spacing) {
    const progress = roadProgress(y);
    const dashHeight = lerp(10, 46, progress);
    const dashWidth = lerp(2, 8, progress);

    for (let lane = 1; lane < LANES; lane += 1) {
      const topX = roadLeftAt(y) + laneWidthAt(y) * lane;
      const bottomY = y + dashHeight;
      const bottomX = roadLeftAt(bottomY) + laneWidthAt(bottomY) * lane;
      ctx.strokeStyle = "rgba(244, 240, 199, 0.84)";
      ctx.lineWidth = dashWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(topX, y);
      ctx.lineTo(bottomX, bottomY);
      ctx.stroke();
    }
  }
}

function drawRoadGloss() {
  const roadGlow = ctx.createLinearGradient(view.center, view.horizon, view.center, view.height);
  roadGlow.addColorStop(0, "rgba(255, 255, 255, 0.08)");
  roadGlow.addColorStop(0.55, "rgba(255, 255, 255, 0)");
  roadGlow.addColorStop(1, "rgba(255, 255, 255, 0.11)");
  ctx.fillStyle = roadGlow;
  ctx.fillRect(roadLeftAt(view.height), view.horizon, roadWidthAt(view.height), view.height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  for (let lane = 0; lane < LANES; lane += 1) {
    const x = xForLane(lane, view.height * 0.72);
    const trackWidth = laneWidthAt(view.height) * 0.13;
    const trackGap = laneWidthAt(view.height) * 0.18;
    const trackGradient = ctx.createLinearGradient(0, view.horizon, 0, view.height);
    trackGradient.addColorStop(0, "rgba(8, 11, 16, 0)");
    trackGradient.addColorStop(0.35, "rgba(8, 11, 16, 0.22)");
    trackGradient.addColorStop(1, "rgba(8, 11, 16, 0.38)");
    ctx.fillStyle = trackGradient;
    roundedRect(x - trackGap - trackWidth * 0.5, view.horizon, trackWidth, view.height, trackWidth);
    ctx.fill();
    roundedRect(x + trackGap - trackWidth * 0.5, view.horizon, trackWidth, view.height, trackWidth);
    ctx.fill();
  }
  ctx.restore();

  for (let lane = 0; lane < LANES; lane += 1) {
    const x = xForLane(lane, view.height * 0.82);
    const laneGlow = ctx.createRadialGradient(x, view.height * 0.78, 20, x, view.height * 0.78, laneWidthAt(view.height) * 0.7);
    laneGlow.addColorStop(0, "rgba(255, 255, 255, 0.07)");
    laneGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = laneGlow;
    ctx.fillRect(x - laneWidthAt(view.height), view.height * 0.45, laneWidthAt(view.height) * 2, view.height * 0.55);
  }
}

function drawShoulderLines() {
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    ctx.strokeStyle = "#f3d960";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(side < 0 ? roadLeftAt(view.horizon) : roadRightAt(view.horizon), view.horizon);
    ctx.lineTo(side < 0 ? roadLeftAt(view.bottom) : roadRightAt(view.bottom), view.bottom);
    ctx.stroke();

    ctx.strokeStyle = side < 0 ? "rgba(238, 57, 77, 0.8)" : "rgba(61, 224, 223, 0.8)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo((side < 0 ? roadLeftAt(view.horizon) : roadRightAt(view.horizon)) + side * 10, view.horizon);
    ctx.lineTo((side < 0 ? roadLeftAt(view.bottom) : roadRightAt(view.bottom)) + side * 18, view.bottom);
    ctx.stroke();
  }
}

function drawEntities() {
  const sorted = [...game.entities].sort((a, b) => a.y - b.y);
  for (const entity of sorted) {
    if (entity.kind === "traffic") {
      drawTraffic(entity);
    } else if (entity.kind === "power") {
      drawPowerup(entity);
    } else {
      drawHazard(entity);
    }
  }
}

function drawTraffic(entity) {
  const dims = dimensionsForEntity(entity);
  const x = xForLane(entity.lane, entity.y);
  drawVehicle(x, entity.y, dims.width, dims.height, entity.color, entity.model.type, "down", entity.shine);
}

function drawPlayer() {
  const dims = playerDimensions();
  const y = playerY();
  const x = xForLane(player.visualLane, y);
  const ghost = game.invincibleUntil > game.time && Math.floor(game.time * 16) % 2 === 0;
  const angle = (player.visualLane - player.lane) * -0.13 + player.wobble * 0.08;

  if (game.shieldUntil > game.time) {
    drawShieldAura(x, y, Math.max(dims.width, dims.height) * 0.64);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = ghost ? 0.52 : 1;
  drawVehicle(0, 0, dims.width, dims.height, "#e9354a", "sports", "up", 0.8, true);
  ctx.restore();

  if (game.turboUntil > game.time) {
    drawTurboFlames(x, y + dims.height * 0.48, dims.width);
  }
}

function drawVehicle(x, y, width, height, color, type, direction, shineSeed, isPlayer = false) {
  ctx.save();
  ctx.translate(x, y);
  if (direction === "down") {
    ctx.rotate(Math.PI);
  }

  drawVehicleShadow(width, height);

  if (type === "truck") {
    drawTruck(width, height, color, shineSeed);
  } else if (type === "van" || type === "pickup") {
    drawVanLike(width, height, color, type, shineSeed);
  } else {
    drawCarBody(width, height, color, type, shineSeed, isPlayer);
  }

  ctx.restore();
}

function drawVehicleShadow(width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(3, 6, 10, 0.34)";
  ctx.filter = `blur(${Math.max(2, width * 0.08)}px)`;
  ctx.beginPath();
  ctx.ellipse(width * 0.04, height * 0.09, width * 0.62, height * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, height * 0.4, width * 0.46, height * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCarBody(width, height, color, type, shineSeed, isPlayer) {
  const radius = Math.min(width * 0.2, 16);
  const bodyGradient = ctx.createLinearGradient(-width * 0.55, -height * 0.52, width * 0.55, height * 0.52);
  bodyGradient.addColorStop(0, shade(color, 0.42));
  bodyGradient.addColorStop(0.3, shade(color, 0.12));
  bodyGradient.addColorStop(0.68, color);
  bodyGradient.addColorStop(1, shade(color, -0.36));

  drawWheels(width, height);
  roundedRect(-width * 0.5, -height * 0.5, width, height, radius);
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  drawBodyRealism(width, height, color, radius);

  drawSideMirrors(width, height);

  const cabinY = type === "sports" ? -height * 0.03 : height * 0.02;
  const cabinH = type === "compact" ? height * 0.42 : height * 0.47;
  drawCabin(width, height, cabinY, cabinH, type);
  drawPanelLines(width, height, type);
  drawGrille(width, height, isPlayer);
  drawLights(width, height, isPlayer);

  if (type === "taxi") {
    drawTaxiSign(width, height);
  } else if (type === "police") {
    drawPoliceBar(width, height);
  }

  drawPaintSparkle(width, height, shineSeed);
}

function drawVanLike(width, height, color, type, shineSeed) {
  drawWheels(width, height);

  const bodyGradient = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  bodyGradient.addColorStop(0, shade(color, 0.28));
  bodyGradient.addColorStop(0.5, color);
  bodyGradient.addColorStop(1, shade(color, -0.32));

  roundedRect(-width * 0.5, -height * 0.5, width, height, width * 0.14);
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  drawBodyRealism(width, height, color, width * 0.14);
  drawSideMirrors(width, height);

  if (type === "pickup") {
    roundedRect(-width * 0.38, height * 0.04, width * 0.76, height * 0.36, width * 0.06);
    ctx.fillStyle = "rgba(20, 24, 30, 0.3)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawCabin(width, height, -height * 0.22, height * 0.34, type);
  } else {
    drawCabin(width, height, -height * 0.06, height * 0.6, type);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundedRect(-width * 0.37, height * 0.18, width * 0.22, height * 0.2, 4);
    ctx.fill();
    roundedRect(width * 0.15, height * 0.18, width * 0.22, height * 0.2, 4);
    ctx.fill();
  }

  drawPanelLines(width, height, type);
  drawGrille(width, height, false);
  drawLights(width, height, false);
  drawPaintSparkle(width, height, shineSeed);
}

function drawTruck(width, height, color, shineSeed) {
  drawWheels(width, height);

  const trailerH = height * 0.62;
  const cabinH = height * 0.3;
  const bodyGradient = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  bodyGradient.addColorStop(0, shade(color, 0.3));
  bodyGradient.addColorStop(0.55, color);
  bodyGradient.addColorStop(1, shade(color, -0.3));

  roundedRect(-width * 0.48, -height * 0.5, width * 0.96, trailerH, width * 0.08);
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.24)";
  ctx.lineWidth = Math.max(1, width * 0.035);
  ctx.stroke();
  drawPanelRibs(width, height, -height * 0.5, trailerH);

  roundedRect(-width * 0.44, height * 0.14, width * 0.88, cabinH, width * 0.1);
  ctx.fillStyle = shade(color, -0.05);
  ctx.fill();
  drawSideMirrors(width, height);
  drawCabin(width, height, height * 0.22, height * 0.23, "truck");
  drawGrille(width, height, false);
  drawLights(width, height, false);
  drawPaintSparkle(width, height, shineSeed);
}

function drawWheels(width, height) {
  const tireGradient = ctx.createLinearGradient(-width * 0.58, 0, width * 0.58, 0);
  tireGradient.addColorStop(0, "#05070a");
  tireGradient.addColorStop(0.5, "#161b22");
  tireGradient.addColorStop(1, "#030405");
  ctx.fillStyle = tireGradient;
  const wheelW = width * 0.16;
  const wheelH = height * 0.18;
  const positions = [-height * 0.32, height * 0.28];
  for (const y of positions) {
    roundedRect(-width * 0.58, y - wheelH / 2, wheelW, wheelH, wheelW * 0.35);
    ctx.fill();
    roundedRect(width * 0.41, y - wheelH / 2, wheelW, wheelH, wheelW * 0.35);
    ctx.fill();
    ctx.fillStyle = "rgba(190, 198, 204, 0.28)";
    ctx.fillRect(-width * 0.545, y - wheelH * 0.24, wheelW * 0.14, wheelH * 0.48);
    ctx.fillRect(width * 0.515, y - wheelH * 0.24, wheelW * 0.14, wheelH * 0.48);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = Math.max(0.6, width * 0.012);
    ctx.beginPath();
    ctx.moveTo(-width * 0.565, y - wheelH * 0.28);
    ctx.lineTo(-width * 0.43, y - wheelH * 0.28);
    ctx.moveTo(width * 0.43, y + wheelH * 0.28);
    ctx.lineTo(width * 0.565, y + wheelH * 0.28);
    ctx.stroke();
    ctx.fillStyle = tireGradient;
  }
}

function drawBodyRealism(width, height, color, radius) {
  const hoodGradient = ctx.createLinearGradient(0, -height * 0.5, 0, height * 0.08);
  hoodGradient.addColorStop(0, "rgba(255,255,255,0.32)");
  hoodGradient.addColorStop(0.42, "rgba(255,255,255,0.06)");
  hoodGradient.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = hoodGradient;
  roundedRect(-width * 0.34, -height * 0.46, width * 0.68, height * 0.38, radius * 0.55);
  ctx.fill();

  const sideShadow = ctx.createLinearGradient(width * 0.18, 0, width * 0.5, 0);
  sideShadow.addColorStop(0, "rgba(0,0,0,0)");
  sideShadow.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = sideShadow;
  roundedRect(width * 0.18, -height * 0.43, width * 0.27, height * 0.82, radius * 0.45);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  roundedRect(-width * 0.4, -height * 0.44, width * 0.11, height * 0.82, radius * 0.45);
  ctx.fill();

  ctx.strokeStyle = shade(color, -0.42);
  ctx.lineWidth = Math.max(1, width * 0.035);
  roundedRect(-width * 0.5, -height * 0.5, width, height, radius);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = Math.max(0.8, width * 0.018);
  ctx.beginPath();
  ctx.moveTo(-width * 0.33, -height * 0.47);
  ctx.lineTo(width * 0.3, -height * 0.47);
  ctx.stroke();
}

function drawSideMirrors(width, height) {
  ctx.fillStyle = "#080b10";
  roundedRect(-width * 0.58, -height * 0.18, width * 0.09, height * 0.16, width * 0.025);
  ctx.fill();
  roundedRect(width * 0.49, -height * 0.18, width * 0.09, height * 0.16, width * 0.025);
  ctx.fill();
  ctx.fillStyle = "rgba(210, 230, 239, 0.35)";
  ctx.fillRect(-width * 0.56, -height * 0.155, width * 0.03, height * 0.1);
  ctx.fillRect(width * 0.53, -height * 0.155, width * 0.03, height * 0.1);
}

function drawPanelRibs(width, height, y, panelHeight) {
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = Math.max(0.8, width * 0.014);
  for (let i = 1; i < 4; i += 1) {
    const lineY = y + (panelHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(-width * 0.4, lineY);
    ctx.lineTo(width * 0.4, lineY);
    ctx.stroke();
  }
}

function drawGrille(width, height, isPlayer) {
  const grilleY = -height * 0.43;
  const grilleGradient = ctx.createLinearGradient(0, grilleY - height * 0.03, 0, grilleY + height * 0.05);
  grilleGradient.addColorStop(0, "#111923");
  grilleGradient.addColorStop(1, "#020304");
  roundedRect(-width * 0.18, grilleY, width * 0.36, height * 0.055, width * 0.02);
  ctx.fillStyle = grilleGradient;
  ctx.fill();

  ctx.strokeStyle = isPlayer ? "rgba(116,255,247,0.45)" : "rgba(220,226,232,0.22)";
  ctx.lineWidth = Math.max(0.6, width * 0.012);
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * width * 0.055, grilleY + height * 0.006);
    ctx.lineTo(i * width * 0.055, grilleY + height * 0.047);
    ctx.stroke();
  }
}

function drawCabin(width, height, centerY, cabinHeight, type) {
  const cabinW = width * (type === "truck" ? 0.72 : 0.66);
  const radius = width * 0.08;
  const glass = ctx.createLinearGradient(-cabinW * 0.45, centerY - cabinHeight * 0.5, cabinW * 0.45, centerY + cabinHeight * 0.5);
  glass.addColorStop(0, "#e9fbff");
  glass.addColorStop(0.18, "#83b4cd");
  glass.addColorStop(0.62, "#1b3148");
  glass.addColorStop(1, "#07111f");

  roundedRect(-cabinW / 2, centerY - cabinHeight / 2, cabinW, cabinHeight, radius);
  ctx.fillStyle = "rgba(6, 12, 20, 0.55)";
  ctx.fill();

  roundedRect(-cabinW * 0.42, centerY - cabinHeight * 0.38, cabinW * 0.84, cabinHeight * 0.34, radius * 0.8);
  ctx.fillStyle = glass;
  ctx.fill();
  drawGlassGlare(cabinW, centerY - cabinHeight * 0.2, cabinHeight * 0.34);

  roundedRect(-cabinW * 0.4, centerY + cabinHeight * 0.09, cabinW * 0.8, cabinHeight * 0.31, radius * 0.8);
  ctx.fillStyle = "rgba(8, 18, 31, 0.9)";
  ctx.fill();
  drawGlassGlare(cabinW, centerY + cabinHeight * 0.24, cabinHeight * 0.31);

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = Math.max(0.8, width * 0.02);
  ctx.beginPath();
  ctx.moveTo(0, centerY - cabinHeight * 0.37);
  ctx.lineTo(0, centerY + cabinHeight * 0.39);
  ctx.stroke();
}

function drawGlassGlare(cabinW, centerY, cabinHeight) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.44)";
  ctx.lineWidth = Math.max(0.7, cabinW * 0.025);
  ctx.beginPath();
  ctx.moveTo(-cabinW * 0.26, centerY - cabinHeight * 0.28);
  ctx.lineTo(cabinW * 0.22, centerY + cabinHeight * 0.2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(147, 219, 255, 0.24)";
  ctx.lineWidth = Math.max(0.6, cabinW * 0.014);
  ctx.beginPath();
  ctx.moveTo(-cabinW * 0.36, centerY + cabinHeight * 0.32);
  ctx.lineTo(cabinW * 0.34, centerY + cabinHeight * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawPanelLines(width, height, type) {
  ctx.strokeStyle = "rgba(0,0,0,0.26)";
  ctx.lineWidth = Math.max(0.8, width * 0.022);
  ctx.beginPath();
  ctx.moveTo(-width * 0.38, -height * 0.27);
  ctx.lineTo(width * 0.38, -height * 0.27);
  ctx.moveTo(-width * 0.38, height * 0.33);
  ctx.lineTo(width * 0.38, height * 0.33);
  if (type === "sports") {
    ctx.moveTo(-width * 0.2, -height * 0.45);
    ctx.lineTo(0, -height * 0.18);
    ctx.lineTo(width * 0.2, -height * 0.45);
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.42)";
  roundedRect(-width * 0.43, height * 0.04, width * 0.08, height * 0.018, 2);
  ctx.fill();
  roundedRect(width * 0.35, height * 0.04, width * 0.08, height * 0.018, 2);
  ctx.fill();
}

function drawLights(width, height, isPlayer) {
  ctx.save();
  ctx.shadowBlur = Math.max(4, width * 0.08);
  ctx.shadowColor = "rgba(255, 245, 183, 0.72)";
  ctx.fillStyle = "#fff6bd";
  roundedRect(-width * 0.36, -height * 0.49, width * 0.19, height * 0.035, 3);
  ctx.fill();
  roundedRect(width * 0.17, -height * 0.49, width * 0.19, height * 0.035, 3);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowBlur = Math.max(3, width * 0.06);
  ctx.shadowColor = isPlayer ? "rgba(116,255,247,0.7)" : "rgba(255,62,78,0.78)";
  ctx.fillStyle = isPlayer ? "#74fff7" : "#ff3e4e";
  roundedRect(-width * 0.34, height * 0.45, width * 0.18, height * 0.045, 3);
  ctx.fill();
  roundedRect(width * 0.16, height * 0.45, width * 0.18, height * 0.045, 3);
  ctx.fill();
  ctx.restore();
}

function drawTaxiSign(width, height) {
  roundedRect(-width * 0.2, -height * 0.08, width * 0.4, height * 0.075, 3);
  ctx.fillStyle = "#ffe468";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.stroke();
}

function drawPoliceBar(width, height) {
  roundedRect(-width * 0.26, -height * 0.07, width * 0.52, height * 0.06, 3);
  ctx.fillStyle = "#f7fbff";
  ctx.fill();
  ctx.fillStyle = "#2f75ff";
  ctx.fillRect(-width * 0.24, -height * 0.065, width * 0.22, height * 0.05);
  ctx.fillStyle = "#ff374a";
  ctx.fillRect(width * 0.02, -height * 0.065, width * 0.22, height * 0.05);
}

function drawPaintSparkle(width, height, shineSeed) {
  const sweep = ((game.time * 0.7 + shineSeed) % 1) * height - height * 0.5;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(0.9, width * 0.03);
  ctx.beginPath();
  ctx.moveTo(-width * 0.32, sweep - height * 0.06);
  ctx.lineTo(width * 0.24, sweep + height * 0.12);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = Math.max(0.6, width * 0.014);
  ctx.beginPath();
  ctx.moveTo(width * 0.05, -height * 0.44);
  ctx.lineTo(width * 0.36, height * 0.38);
  ctx.stroke();
}

function drawShieldAura(x, y, radius) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(game.time * 9) * 0.05;
  ctx.scale(pulse, pulse);
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius);
  gradient.addColorStop(0, "rgba(61,224,223,0.08)");
  gradient.addColorStop(0.62, "rgba(61,224,223,0.2)");
  gradient.addColorStop(1, "rgba(61,224,223,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(102,255,246,0.75)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 6;
    const px = Math.cos(angle) * radius * 0.72;
    const py = Math.sin(angle) * radius * 0.72;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTurboFlames(x, y, width) {
  ctx.save();
  ctx.translate(x, y);
  const flameHeight = width * (0.5 + Math.sin(game.time * 28) * 0.08);
  const gradient = ctx.createLinearGradient(0, 0, 0, flameHeight);
  gradient.addColorStop(0, "rgba(117,255,247,0.85)");
  gradient.addColorStop(0.55, "rgba(255,212,95,0.72)");
  gradient.addColorStop(1, "rgba(255,76,72,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(-width * 0.18, 0);
  ctx.quadraticCurveTo(0, flameHeight * 0.56, width * 0.18, 0);
  ctx.quadraticCurveTo(0, flameHeight * 0.25, -width * 0.18, 0);
  ctx.fill();
  ctx.restore();
}

function drawPowerup(entity) {
  const dims = dimensionsForEntity(entity);
  const x = xForLane(entity.lane, entity.y);
  const bob = Math.sin(entity.bob) * dims.height * 0.12;
  const y = entity.y + bob;
  const size = dims.width;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(game.time * 2 + entity.id) * 0.12);
  ctx.shadowBlur = Math.max(8, size * 0.42);
  ctx.shadowColor = powerColor(entity.subtype);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.48, size * 0.38, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (entity.subtype === "shield") {
    drawShieldIcon(size);
  } else if (entity.subtype === "life") {
    drawLifeIcon(size);
  } else if (entity.subtype === "turbo") {
    drawTurboIcon(size);
  } else {
    drawClearIcon(size);
  }
  ctx.restore();
}

function powerColor(type) {
  if (type === "shield") return "rgba(61,224,223,0.85)";
  if (type === "life") return "rgba(238,57,77,0.85)";
  if (type === "turbo") return "rgba(255,212,95,0.85)";
  return "rgba(122,230,117,0.85)";
}

function drawShieldIcon(size) {
  const gradient = ctx.createLinearGradient(0, -size * 0.45, 0, size * 0.45);
  gradient.addColorStop(0, "rgba(43, 74, 96, 0.96)");
  gradient.addColorStop(1, "rgba(6, 20, 34, 0.96)");
  ctx.fillStyle = gradient;
  ctx.strokeStyle = "#66fff6";
  ctx.lineWidth = size * 0.08;
  hexagon(size * 0.52);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#66fff6";
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.27);
  ctx.lineTo(size * 0.2, -size * 0.12);
  ctx.lineTo(size * 0.12, size * 0.23);
  ctx.lineTo(0, size * 0.32);
  ctx.lineTo(-size * 0.12, size * 0.23);
  ctx.lineTo(-size * 0.2, -size * 0.12);
  ctx.closePath();
  ctx.fill();
}

function drawLifeIcon(size) {
  const gradient = ctx.createRadialGradient(-size * 0.18, -size * 0.18, 2, 0, 0, size * 0.56);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#e8edf1");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ee394d";
  roundedRect(-size * 0.08, -size * 0.28, size * 0.16, size * 0.56, size * 0.03);
  ctx.fill();
  roundedRect(-size * 0.28, -size * 0.08, size * 0.56, size * 0.16, size * 0.03);
  ctx.fill();
}

function drawTurboIcon(size) {
  const gradient = ctx.createLinearGradient(-size * 0.2, -size * 0.45, size * 0.2, size * 0.45);
  gradient.addColorStop(0, "#fff59e");
  gradient.addColorStop(1, "#f3ba2d");
  ctx.fillStyle = gradient;
  ctx.strokeStyle = "#7a4d00";
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.moveTo(-size * 0.02, -size * 0.46);
  ctx.lineTo(-size * 0.34, size * 0.04);
  ctx.lineTo(-size * 0.04, size * 0.04);
  ctx.lineTo(-size * 0.18, size * 0.47);
  ctx.lineTo(size * 0.34, -size * 0.12);
  ctx.lineTo(size * 0.06, -size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawClearIcon(size) {
  const gradient = ctx.createRadialGradient(-size * 0.16, -size * 0.2, 2, 0, 0, size * 0.6);
  gradient.addColorStop(0, "#a8ff9d");
  gradient.addColorStop(1, "#46bf52");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#123b20";
  ctx.lineWidth = size * 0.08;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.27, 0.2, Math.PI * 1.72);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.23, -size * 0.16);
  ctx.lineTo(size * 0.39, -size * 0.13);
  ctx.lineTo(size * 0.28, size * 0.02);
  ctx.closePath();
  ctx.fillStyle = "#123b20";
  ctx.fill();
}

function drawHazard(entity) {
  const dims = dimensionsForEntity(entity);
  const x = xForLane(entity.lane, entity.y);
  const y = entity.y;

  ctx.save();
  ctx.translate(x, y);

  if (entity.subtype === "puddle") {
    drawPuddle(dims.width, dims.height, entity.wobble);
  } else if (entity.subtype === "breaker") {
    drawBreaker(dims.width, entity.wobble);
  } else {
    drawOil(dims.width, dims.height, entity.wobble);
  }

  ctx.restore();
}

function drawPuddle(width, height, wobble) {
  const gradient = ctx.createRadialGradient(0, 0, 4, 0, 0, width * 0.6);
  gradient.addColorStop(0, "rgba(206, 247, 255, 0.86)");
  gradient.addColorStop(0.38, "rgba(65, 174, 225, 0.68)");
  gradient.addColorStop(1, "rgba(17, 86, 124, 0.12)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  for (let i = 0; i < 14; i += 1) {
    const angle = (Math.PI * 2 * i) / 14;
    const radius = width * (0.36 + Math.sin(wobble + i * 1.7) * 0.08);
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius * 0.42;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(216, 250, 255, 0.62)";
  ctx.lineWidth = Math.max(1, height * 0.1);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(0.8, height * 0.08);
  ctx.beginPath();
  ctx.ellipse(-width * 0.08, -height * 0.08, width * 0.18, height * 0.22, -0.2, 0, Math.PI * 1.3);
  ctx.stroke();
  ctx.strokeStyle = "rgba(45, 120, 170, 0.3)";
  ctx.beginPath();
  ctx.ellipse(width * 0.08, height * 0.03, width * 0.28, height * 0.35, 0.12, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBreaker(width, wobble) {
  ctx.rotate(wobble * 0.15);
  const glow = ctx.createRadialGradient(0, 0, width * 0.08, 0, 0, width * 0.58);
  glow.addColorStop(0, "rgba(255,255,255,0.72)");
  glow.addColorStop(0.42, "rgba(140, 98, 255, 0.38)");
  glow.addColorStop(1, "rgba(140, 98, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, width * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(196, 160, 255, 0.92)";
  ctx.lineWidth = width * 0.08;
  ctx.beginPath();
  ctx.arc(0, 0, width * 0.34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#5f35df";
  ctx.lineWidth = width * 0.06;
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI * 0.5 + wobble * 0.1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * width * 0.13, Math.sin(angle) * width * 0.13);
    ctx.lineTo(Math.cos(angle) * width * 0.48, Math.sin(angle) * width * 0.48);
    ctx.stroke();
  }
  ctx.fillStyle = "#20123d";
  ctx.beginPath();
  ctx.arc(0, 0, width * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(-width * 0.03, -width * 0.03, width * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

function drawOil(width, height, wobble) {
  ctx.rotate(Math.sin(wobble) * 0.16);
  const gradient = ctx.createRadialGradient(-width * 0.1, -height * 0.04, 4, 0, 0, width * 0.62);
  gradient.addColorStop(0, "rgba(96, 105, 116, 0.78)");
  gradient.addColorStop(0.46, "rgba(20, 23, 26, 0.82)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.14)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.46, height * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  const rainbow = ctx.createLinearGradient(-width * 0.35, -height * 0.25, width * 0.35, height * 0.25);
  rainbow.addColorStop(0, "rgba(99, 255, 230, 0.16)");
  rainbow.addColorStop(0.35, "rgba(159, 113, 255, 0.22)");
  rainbow.addColorStop(0.68, "rgba(255, 214, 99, 0.14)");
  rainbow.addColorStop(1, "rgba(255, 82, 120, 0.12)");
  ctx.fillStyle = rainbow;
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.38, height * 0.62, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(146, 113, 255, 0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(width * 0.02, -height * 0.02, width * 0.3, height * 0.42, 0.2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawParticles() {
  for (const particle of particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawVignette() {
  const vignette = ctx.createRadialGradient(view.center, view.height * 0.48, view.height * 0.2, view.center, view.height * 0.52, view.height * 0.86);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(5,10,18,0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, view.width, view.height);

  if (game.mode === "ready") {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(0, 0, view.width, view.height);
  }
}

function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexagon(radius) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / 6;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

function bindEvents() {
  ui.start.addEventListener("click", startGame);
  ui.go.addEventListener("click", goGame);
  ui.pause.addEventListener("click", togglePause);
  ui.music.addEventListener("click", toggleMusic);
  ui.quit.addEventListener("click", quitGame);
  ui.resume.addEventListener("click", togglePause);
  ui.credits.addEventListener("click", showCredits);
  ui.creditsBack.addEventListener("click", backToPause);
  ui.creditsPlay.addEventListener("click", playFromCredits);
  ui.pauseQuit.addEventListener("click", quitGame);
  ui.retry.addEventListener("click", startGame);
  ui.gameOverQuit.addEventListener("click", quitGame);
  ui.left.addEventListener("click", () => moveLane(-1));
  ui.right.addEventListener("click", () => moveLane(1));

  window.addEventListener("keydown", (event) => {
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      event.preventDefault();
      moveLane(-1);
    } else if (event.code === "ArrowRight" || event.code === "KeyD") {
      event.preventDefault();
      moveLane(1);
    } else if (event.code === "KeyP") {
      event.preventDefault();
      togglePause();
    } else if (event.code === "Space" || event.code === "Enter") {
      if (game.mode === "title") {
        event.preventDefault();
        startGame();
      } else if (game.mode === "ready") {
        event.preventDefault();
        goGame();
      }
    } else if (event.code === "Escape") {
      if (game.mode === "running") {
        togglePause();
      } else if (game.mode === "paused") {
        togglePause();
      } else if (game.mode === "credits") {
        backToPause();
      }
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (game.mode !== "running" && game.mode !== "ready") {
      return;
    }
    moveLane(event.clientX < view.width / 2 ? -1 : 1);
  });

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseMusic();
    } else {
      syncMusicToMode();
    }
  });
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_DELTA);
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function boot() {
  resize();
  bindEvents();
  updateMusicUi();
  updateUi();
  draw();
  requestAnimationFrame(frame);
}

boot();

window.__carsRUs = {
  game,
  player,
  startGame,
  goGame,
  moveLane,
  toggleMusic,
  music,
};
