// Deterministic 2D/3D value-gradient (Perlin-style) noise with seedable PRNG.
// No external dependencies.

export class RNG {
  constructor(seed = 1337) {
    this.s = seed >>> 0;
  }
  // xorshift32
  next() {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 0xffffffff;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
}

// Classic Perlin noise (Ken Perlin's improved version), seeded permutation.
export class Perlin {
  constructor(seed = 1337) {
    const rng = new RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  static fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  static lerp(a, b, t) {
    return a + t * (b - a);
  }
  static grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise3(x, y, z) {
    const p = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = Perlin.fade(x);
    const v = Perlin.fade(y);
    const w = Perlin.fade(z);
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return Perlin.lerp(
      Perlin.lerp(
        Perlin.lerp(Perlin.grad(p[AA], x, y, z), Perlin.grad(p[BA], x - 1, y, z), u),
        Perlin.lerp(Perlin.grad(p[AB], x, y - 1, z), Perlin.grad(p[BB], x - 1, y - 1, z), u),
        v
      ),
      Perlin.lerp(
        Perlin.lerp(Perlin.grad(p[AA + 1], x, y, z - 1), Perlin.grad(p[BA + 1], x - 1, y, z - 1), u),
        Perlin.lerp(Perlin.grad(p[AB + 1], x, y - 1, z - 1), Perlin.grad(p[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }

  noise2(x, y) {
    return this.noise3(x, y, 0);
  }

  // Fractal Brownian Motion (octave sum) in 2D, returns roughly [-1, 1].
  fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
