// Pure world layout and terrain functions shared by the game and its tests.

export const RING = 110;          // ring road radius
export const ROAD_W = 8;
export const ZROAD_END = -176;    // south road runs out to the lighthouse
export const WATER_Y = -0.6;
export const G = 28;              // gravity
export const HILL = { x: -62, z: 62 };
export const PARK = { x: 52, z: -52 };
export const LIGHTHOUSE = { x: 0, z: -190 };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

export function roadDist(x, z) {
  const r = Math.hypot(x, z);
  return Math.min(
    Math.abs(r - RING),
    segDist(x, z, -RING, 0, RING, 0),
    segDist(x, z, 0, ZROAD_END, 0, RING)
  );
}

// Radius with a wobbly coastline.
export function wob(x, z) {
  const a = Math.atan2(z, x);
  return Math.hypot(x, z) + 6 * Math.sin(a * 5 + 0.7) + 4 * Math.sin(a * 9 + 2.1) + 2 * Math.sin(a * 17);
}

export function terrainH(x, z) {
  const r = Math.hypot(x, z);
  let n = 5 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.4)
        + 3.2 * Math.sin(x * 0.043 - z * 0.031 + 2.1)
        + 1.6 * Math.sin(x * 0.09 + z * 0.07)
        + 0.8 * Math.sin(x * 0.2) * Math.sin(z * 0.17);
  n = Math.max(n * 1.15 - 0.6, 0);
  const dh = (x - HILL.x) ** 2 + (z - HILL.z) ** 2;
  n += 15 * Math.exp(-dh / (2 * 21 * 21));
  const mask = smooth(7, 26, roadDist(x, z))
    * smooth(30, 48, r)
    * smooth(30, 46, Math.hypot(x - PARK.x, z - PARK.z));
  const h = n * mask;
  // Coastline, with a small peninsula so the lighthouse stays on dry land.
  const e = smooth(186, 226, wob(x, z)) * smooth(14, 34, Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z));
  return h * (1 - e) - 4 * e;
}

// ---------- ramps and boost pads ----------
function frame(x, z, h) {
  return { x, z, h, fx: Math.sin(h), fz: Math.cos(h), rx: Math.cos(h), rz: -Math.sin(h) };
}
export const ramps = [];
export const pads = [];
export const coinSpots = [];   // [x, z, heightAboveGround]

function table(x, z, h, H = 2.8) { ramps.push({ ...frame(x, z, h), type: 'table', W: 8, H, up: 9, top: 6 }); }
function wedge(x, z, h) { ramps.push({ ...frame(x, z, h), type: 'wedge', W: 7, H: 3.5, L: 12 }); }
function pad(x, z, h) { pads.push({ ...frame(x, z, h), L: 7, W: 6 }); }
function coin(x, z, dy = 1.6) { coinSpots.push([x, z, dy]); }

// Tabletop jumps on the four spokes, with a boost pad before each.
for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
  const h = Math.atan2(dx, dz);
  table(dx * 50, dz * 50, h);
  pad(dx * 24, dz * 24, h);
  coin(dx * 50, dz * 50);           // sits on the tabletop
  coin(dx * 88 + (dz ? 2 : 0), dz * 88 + (dx ? 2 : 0));
}
coin(0, -140);
coin(-2, -28);                       // first coin, right in front of the start

// Two low tabletops on the ring road (anticlockwise travel direction).
for (const deg of [45, 225]) {
  const a = deg * Math.PI / 180;
  table(Math.cos(a) * RING, Math.sin(a) * RING, -a, 1.8);
  coin(Math.cos(a) * RING, Math.sin(a) * RING);
}
for (let i = 0; i < 12; i++) {
  const deg = i * 30 + 15;
  if (deg === 45 || deg === 225) continue;
  const a = deg * Math.PI / 180;
  coin(Math.cos(a) * RING, Math.sin(a) * RING);
}

// Stunt park: three kicker ramps, each with a coin hanging in the air past the lip.
for (let k = 0; k < 3; k++) {
  const ang = k * 2 * Math.PI / 3 + 0.3;
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const fx = -dz, fz = dx;
  const h = Math.atan2(fx, fz);
  const cx = PARK.x + dx * 12, cz = PARK.z + dz * 12;
  wedge(cx, cz, h);
  coin(cx + fx * 18, cz + fz * 18, 5);
}
coin(PARK.x, PARK.z);

// Windmill hill.
coin(HILL.x + 9, HILL.z - 9);
coin(HILL.x - 11, HILL.z + 1);
coin(HILL.x + 1, HILL.z + 12);

// Lighthouse.
coin(LIGHTHOUSE.x + 8, LIGHTHOUSE.z + 6);

// Hidden in the forest outside the ring.
for (const deg of [20, 75, 130, 165, 200, 290, 335]) {
  const a = deg * Math.PI / 180;
  coin(Math.cos(a) * 160, Math.sin(a) * 160);
}

// Beach coins: walk inward until the sand is safely above the water.
for (const deg of [55, 150, 245, 320]) {
  const a = deg * Math.PI / 180;
  let r = 205;
  while (r > 170 && terrainH(Math.cos(a) * r, Math.sin(a) * r) < WATER_Y + 0.9) r -= 1;
  coin(Math.cos(a) * r, Math.sin(a) * r);
}

function rampProfile(rp, u) {
  if (rp.type === 'table') {
    const half = rp.up + rp.top / 2;
    if (u < -half || u > half) return 0;
    if (u < -rp.top / 2) return rp.H * (u + half) / rp.up;
    if (u > rp.top / 2) return rp.H * (half - u) / rp.up;
    return rp.H;
  }
  if (u < -rp.L / 2 || u > rp.L / 2) return 0;
  return rp.H * (u + rp.L / 2) / rp.L;
}

export function rampH(x, z) {
  let best = 0;
  for (const rp of ramps) {
    const dx = x - rp.x, dz = z - rp.z;
    if (dx * dx + dz * dz > 400) continue;
    const v = dx * rp.rx + dz * rp.rz;
    if (Math.abs(v) > rp.W / 2) continue;
    const u = dx * rp.fx + dz * rp.fz;
    best = Math.max(best, rampProfile(rp, u));
  }
  return best;
}

export function ground(x, z) {
  return terrainH(x, z) + rampH(x, z);
}

export function onPad(x, z) {
  for (const p of pads) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx * p.fx + dz * p.fz) < p.L / 2 && Math.abs(dx * p.rx + dz * p.rz) < p.W / 2) return p;
  }
  return null;
}
