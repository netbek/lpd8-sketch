// ===== MIDI CONFIG =====
// Your LPD8 is in CC mode: pads send CC#1-CC#8, knobs send CC#17-CC#24
const MIDI = {
  padCCs: [1, 2, 3, 4, 5, 6, 7, 8],
  knobCCs: [17, 18, 19, 20, 21, 22, 23, 24],
};

const PAD_NAMES = [
  "Fountain",
  "Explosion",
  "Spiral",
  "Implosion",
  "Rain",
  "Vortex",
  "Bubbles",
  "Fire",
];
const KNOB_NAMES = [
  "Rate",
  "Speed",
  "Size",
  "Life",
  "Hue",
  "Gravity",
  "Spread",
  "Fade",
];
const MODE_HUES = [0, 45, 90, 135, 180, 225, 270, 315];

// ===== STATE =====
let activePads = new Set();
let padVelocity = {};
let knobRaw = new Array(8).fill(0);
let midiConnected = false;
let midiInput = null;
let particles = [];
let trailAlpha = 0.02;
let ripples = [];

// ===== PARTICLE =====
class Particle {
  constructor(x, y, vx, vy, h, s, b, baseSize, life, shape = "circle") {
    this.pos = createVector(x, y);
    this.vel = createVector(vx, vy);
    this.acc = createVector(0, 0);
    this.h = h;
    this.s = s;
    this.b = b;
    this.baseSize = baseSize;
    this.maxLife = life;
    this.life = life;
    this.age = 0;
    this.shape = shape;
  }

  applyForce(f) {
    this.acc.add(f);
  }

  update() {
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.acc.mult(0);
    this.age++;
    this.life--;
  }

  draw() {
    const lifeRatio = constrain(this.life / this.maxLife, 0, 1);
    const alpha =
      constrain(map(this.age, 0, this.maxLife * 0.3, 0, 1), 0, 1) * lifeRatio;
    const r = this.baseSize * (0.4 + 0.6 * lifeRatio);

    const c = color(this.h % 360, this.s, this.b, alpha * 100);
    noStroke();
    fill(c);
    if (this.shape === "rect") {
      rect(this.pos.x - r / 2, this.pos.y - r / 2, r, r);
    } else {
      circle(this.pos.x, this.pos.y, r);
    }

    drawingContext.shadowBlur = r * 1.5;
    drawingContext.shadowColor = c.toString();
    if (this.shape === "rect") {
      rect(this.pos.x - r / 2, this.pos.y - r / 2, r, r);
    } else {
      circle(this.pos.x, this.pos.y, r);
    }
    drawingContext.shadowBlur = 0;
  }

  isDead() {
    return this.life <= 0;
  }
}

// ===== RIPPLE =====
function addRipple(x, y, p) {
  ripples.push({
    x,
    y,
    birth: frameCount,
    duration: p.life * 2,
    speed: p.speed * 2.5 + 0.5,
    ringSpacing: p.size * 2 + 10,
    ringCount: floor(p.spread * 6) + 2,
    hue: p.hue + random(-40, 40),
    sat: 70,
    bri: 90,
  });
}

function drawRipples() {
  strokeWeight(1.2);
  noFill();
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    const age = frameCount - r.birth;
    const progress = age / r.duration;

    if (progress >= 1) {
      ripples.splice(i, 1);
      continue;
    }

    const baseAlpha = (1 - progress) * 80;

    for (let j = 0; j < r.ringCount; j++) {
      const radius = j * r.ringSpacing + age * r.speed;
      const alpha = baseAlpha * (1 - j / r.ringCount);
      if (alpha <= 2) continue;
      stroke(r.hue + j * 10, r.sat, r.bri, alpha);
      circle(r.x, r.y, radius * 2);
    }
  }
  strokeWeight(1);
}

// ===== FIREWORKS =====
let rockets = [];

function launchRocket(p) {
  rockets.push({
    x: random(width),
    y: height + 10,
    vy: -(p.speed * 3 + 4),
    peakY: random(height * 0.1, height * 0.4),
    trail: [],
    maxTrail: 14,
    hue: p.hue + random(-30, 30),
    sat: 80,
    bri: 100,
    exploded: false,
  });
}

function drawRockets(p) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];

    if (r.exploded) {
      rockets.splice(i, 1);
      continue;
    }

    r.vy += 0.08;
    r.y += r.vy;
    r.trail.push({ x: r.x, y: r.y });
    if (r.trail.length > r.maxTrail) r.trail.shift();

    if (r.y <= r.peakY || r.vy > 0) {
      r.exploded = true;
      const count = floor(random(80, 200));
      const baseHue = r.hue;
      for (let j = 0; j < count; j++) {
        const a = random(TWO_PI);
        const spd = p.speed * (2 + random(5));
        spawn(
          r.x,
          r.y,
          cos(a) * spd,
          sin(a) * spd,
          baseHue + random(-60, 60),
          r.sat + random(-20, 20),
          r.bri,
          p.size * random(0.3, 1.2),
          p.life * random(0.5, 1.2),
        );
      }
      continue;
    }

    noStroke();
    for (let j = 0; j < r.trail.length; j++) {
      const t = r.trail[j];
      const alpha = map(j, 0, r.trail.length - 1, 0, 80);
      const rad = map(j, 0, r.trail.length - 1, 1, 4);
      fill(r.hue, 40, 80, alpha);
      circle(t.x, t.y, rad * 2);
    }

    fill(0, 0, 100, 100);
    circle(r.x, r.y, 6);
  }
}

const MAX_PARTICLES = 4000;

function spawn(x, y, vx, vy, h, s, b, size, life, shape = "circle") {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push(new Particle(x, y, vx, vy, h, s, b, size, life, shape));
}

// ===== PER-PAD EMITTERS =====
function emitFountain(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const a = random(-p.spread * 0.4, p.spread * 0.4);
    const spd = p.speed * (3 + random(3)) * velScale;
    spawn(
      x + random(-4, 4),
      y + random(-4, 4),
      sin(a) * spd,
      -spd * 1.2 - random(p.speed),
      p.hue + random(-25, 25),
      p.sat,
      p.bri,
      p.size * random(0.5, 1.5),
      p.life * random(0.7, 1.3),
    );
  }
}

function emitExplosion(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const a = random(TWO_PI);
    const spd = p.speed * (3 + random(5)) * velScale;
    spawn(
      x,
      y,
      cos(a) * spd,
      sin(a) * spd,
      p.hue + random(-30, 30),
      p.sat,
      p.bri,
      p.size * random(0.4, 1.2),
      p.life * random(0.5, 1),
    );
  }
}

function emitSpiral(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const a = random(TWO_PI);
    const spd = p.speed * 2 * velScale;
    const tanComp = 1.2;
    const radComp = 0.6;
    spawn(
      x,
      y,
      (cos(a) * radComp - sin(a) * tanComp) * spd,
      (sin(a) * radComp + cos(a) * tanComp) * spd,
      p.hue + random(-20, 20),
      p.sat,
      p.bri,
      p.size * random(0.5, 1.3),
      p.life * random(0.6, 1.1),
    );
  }
}

function emitImplosion(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const a = random(TWO_PI);
    const dist = 30 + random(80);
    const spd = p.speed * (2 + random(3)) * velScale;
    spawn(
      x + cos(a) * dist,
      y + sin(a) * dist,
      -cos(a) * spd,
      -sin(a) * spd,
      p.hue + random(-20, 20),
      p.sat,
      p.bri,
      p.size * random(0.3, 0.9),
      p.life * random(0.4, 0.8),
    );
  }
}

function emitRain(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const spd = p.speed * (2 + random(4)) * velScale;
    spawn(
      x + random(-p.spread * 3, p.spread * 3),
      y - random(50, 200),
      random(-0.5, 0.5),
      spd,
      p.hue + random(-10, 10),
      p.sat,
      p.bri,
      p.size * random(0.2, 0.6),
      p.life * random(0.3, 0.6),
    );
  }
}

function emitVortex(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const a = random(TWO_PI);
    const spd = p.speed * 3 * velScale;
    const inPull = 0.4;
    const tangent = 1.0;
    spawn(
      x,
      y,
      (-cos(a) * inPull - sin(a) * tangent) * spd,
      (-sin(a) * inPull + cos(a) * tangent) * spd,
      p.hue + random(-30, 30),
      p.sat,
      p.bri,
      p.size * random(0.4, 1.0),
      p.life * random(0.6, 1.0),
    );
  }
}

function emitBubbles(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const spd = p.speed * (0.5 + random(1.5)) * velScale;
    spawn(
      x + random(-p.spread, p.spread),
      y,
      random(-0.8, 0.8),
      -spd,
      p.hue + random(-40, 40),
      p.sat - random(20),
      p.bri + random(10),
      p.size * random(0.6, 1.8),
      p.life * random(0.7, 1.5),
    );
  }
}

function emitFire(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const spd = p.speed * (5 + random(6)) * velScale;
    const fireHue = p.hue + random(-20, 40);
    spawn(
      x + random(-8, 8),
      y + random(-4, 4),
      random(-p.spread * 0.3, p.spread * 0.3),
      -spd,
      fireHue,
      p.sat + 20,
      p.bri,
      p.size * random(0.4, 1.6),
      p.life * random(0.3, 0.7),
    );
  }
}

function emitFireSquares(x, y, count, p, velScale) {
  for (let i = 0; i < count; i++) {
    const spd = p.speed * (5 + random(6)) * velScale;
    const fireHue = p.hue + random(-20, 40);
    spawn(
      x + random(-8, 8),
      y + random(-4, 4),
      random(-p.spread * 0.3, p.spread * 0.3),
      -spd,
      fireHue,
      p.sat + 20,
      p.bri,
      p.size * random(0.4, 1.6),
      p.life * random(0.3, 0.7),
      "rect",
    );
  }
}

const EMITTERS = [
  emitFountain,
  emitExplosion,
  emitSpiral,
  emitImplosion,
  emitRain,
  emitVortex,
  emitBubbles,
  emitFireSquares,
];

// ===== PARAMETERS FROM KNOBS =====
function getKnobParams() {
  return {
    rate: map(knobRaw[0], 0, 127, 0.5, 16),
    speed: map(knobRaw[1], 0, 127, 0.1, 6),
    size: map(knobRaw[2], 0, 127, 1, 18),
    life: map(knobRaw[3], 0, 127, 12, 200),
    hue: map(knobRaw[4], 0, 127, 0, 360),
    gravity: map(knobRaw[5], 0, 127, -0.4, 0.4),
    spread: map(knobRaw[6], 0, 127, 0.05, PI * 0.5),
    fade: map(knobRaw[7], 0, 127, 0.003, 0.08),
    sat: 80,
    bri: 90,
  };
}

// ===== MIDI SETUP =====
function setupMIDI() {
  if (!navigator.requestMIDIAccess) {
    return;
  }
  navigator.requestMIDIAccess().then(
    (access) => {
      for (const input of access.inputs.values()) {
        const name = input.name.toLowerCase();
        if (name.includes("lpd8") || name.includes("lpd 8")) {
          midiInput = input;
          input.onmidimessage = onMIDIMessage;
          midiConnected = true;
          break;
        }
      }
    },
    () => {},
  );
}

function onMIDIMessage(event) {
  const data = event.data;
  if (data.length < 3) return;
  const status = data[0];
  const type = status & 0xf0;
  const d1 = data[1];
  const d2 = data[2];

  const typeName =
    type === 0x90
      ? "NoteOn"
      : type === 0x80
        ? "NoteOff"
        : type === 0xb0
          ? "CC"
          : `0x${type.toString(16)}`;
  console.log(
    `MIDI: ${typeName}  ch${(status & 0x0f) + 1}  data1=${d1}  data2=${d2}`,
  );

  if (type === 0xb0) {
    let idx = MIDI.padCCs.indexOf(d1);
    if (idx >= 0) {
      if (d2 > 0) {
        activePads.add(idx);
        padVelocity[idx] = d2;
      } else {
        activePads.delete(idx);
      }
      return;
    }
    idx = MIDI.knobCCs.indexOf(d1);
    if (idx >= 0) {
      knobRaw[idx] = d2;
    }
  }
}

// ===== P5 SKETCH =====
function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  rectMode(CORNER);
  setupMIDI();
}

function draw() {
  const p = getKnobParams();
  trailAlpha = p.fade;

  drawingContext.fillStyle = `rgba(0,0,0,${trailAlpha})`;
  drawingContext.fillRect(0, 0, width, height);

  for (const idx of activePads) {
    const vs = (padVelocity[idx] || 64) / 127;
    const count = ceil(p.rate * vs);
    const x = random(width);
    const y = random(height);
    EMITTERS[idx](x, y, count, p, vs);
    if (random() < 0.12 + 0.08 * vs) {
      addRipple(x, y, p);
    }
  }

  let gravForce = createVector(0, p.gravity);
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.applyForce(gravForce);
    pt.update();
    if (
      pt.isDead() ||
      pt.pos.x < -200 ||
      pt.pos.x > width + 200 ||
      pt.pos.y < -200 ||
      pt.pos.y > height + 200
    ) {
      particles.splice(i, 1);
      continue;
    }
    pt.draw();
  }

  drawRipples();
  drawRockets(p);

  drawHUD(p);
}

function drawHUD(p) {
  push();
  resetMatrix();

  noStroke();
  fill(0, 0, 0, 70);
  rect(0, 0, 210, height);

  const hudAlpha = 90;
  const textCol = color(0, 0, 100, hudAlpha);
  const dimCol = color(0, 0, 60, hudAlpha);
  const barBg = color(0, 0, 30, hudAlpha);
  const barFg = color(200, 80, 90, hudAlpha);
  const activeBg = color(120, 80, 90, hudAlpha);

  textFont("monospace");
  textSize(15);
  textAlign(LEFT, CENTER);

  const lx = 12;
  const barW = 80;
  const barH = 6;
  let yy = 20;

  fill(dimCol);
  text(midiConnected ? "LPD8: Connected" : "LPD8: Not found", lx, yy);
  yy += 22;

  for (let i = 0; i < 8; i++) {
    const frac = knobRaw[i] / 127;
    const valText = i < KNOB_NAMES.length ? KNOB_NAMES[i] : `CC${i + 1}`;

    fill(textCol);
    text(valText, lx, yy);
    fill(dimCol);
    text(nf(round(frac * 100), 2), lx + 78, yy);

    fill(barBg);
    noStroke();
    rect(lx + 100, yy - barH / 2, barW, barH, 2);

    fill(lerpColor(color(0, 80, 100), color(200, 80, 100), frac));
    rect(lx + 100, yy - barH / 2, barW * frac, barH, 2);

    yy += 18;
  }

  yy += 8;
  fill(dimCol);
  text("Pads", lx, yy);
  yy += 18;

  for (let i = 0; i < 8; i++) {
    const isActive = activePads.has(i);
    fill(isActive ? activeBg : barBg);
    noStroke();
    rect(lx + i * 42, yy - 6, 38, 16, 3);

    fill(isActive ? 0 : dimCol);
    textSize(9);
    textAlign(CENTER, CENTER);
    text(PAD_NAMES[i].slice(0, 5), lx + i * 42 + 19, yy + 2);
    textSize(11);
    textAlign(LEFT, CENTER);
  }

  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed() {
  if (key >= "1" && key <= "8") {
    const idx = parseInt(key) - 1;
    if (activePads.has(idx)) activePads.delete(idx);
    else {
      activePads.add(idx);
      padVelocity[idx] = 100;
    }
  }
  if (key === " ") {
    const p = getKnobParams();
    for (let i = 0; i < ceil(p.rate * 1.5); i++) {
      launchRocket(p);
    }
  }
}
