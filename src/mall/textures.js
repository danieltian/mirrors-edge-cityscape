import { RNG } from '../util/rng.js';
import { once, canvas, toTexture, field, samp, normalMap, paint, emblem, FONT } from '../office/textures.js';

// Mall textures: roller shutters, mosaic tile, plaza paving (shared), and
// per-mall artwork: shop signs, hanging banners, billboards, lightbox
// posters, the directory map and the mall's own name sign.

// Roller shutter slats, 1 m per repeat.
export function shutter() {
  return once('shutter', () => {
    const rng = new RNG(83);
    const S = 512;
    const hgt = new Float32Array(S * S);
    const dirt = field(rng, 128, 4, 3, 0.5);
    const [c] = paint(S, S, (x, y, out) => {
      const p = (y % 32) / 32; // 6 cm slats
      const rib = Math.sin(p * Math.PI);
      const groove = p < 0.07 ? 1 : 0;
      const n = rng.next() - 0.5;
      const v = 214 + rib * 26 - groove * 70 + (samp(dirt, x / S, y / S) - 0.5) * 12 + n * 4;
      out[0] = v;
      out[1] = v;
      out[2] = v + 2;
      hgt[y * S + x] = rib * 0.8 - groove * 0.6;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 2.2) };
  });
}

// Small square mosaic tiles, 2.5 cm, neutral (tinted by the material), 1.2 m per repeat.
export function mosaic() {
  return once('mosaic', () => {
    const rng = new RNG(89);
    const S = 1024;
    const P = S / 48;
    const hgt = new Float32Array(S * S);
    const tone = Array.from({ length: 48 * 48 }, () => rng.range(-1, 1));
    const [c] = paint(S, S, (x, y, out) => {
      const tx = Math.floor(x / P);
      const ty = Math.floor(y / P);
      const lx = x - tx * P;
      const ly = y - ty * P;
      const e = Math.min(lx, P - lx, ly, P - ly);
      const g = e < 1.4;
      const v = g ? 175 : 236 + tone[ty * 48 + tx] * 12 + (rng.next() - 0.5) * 5;
      out[0] = v;
      out[1] = v;
      out[2] = v;
      hgt[y * S + x] = g ? 0 : Math.min(1, e / 3);
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 1.6) };
  });
}

// Plaza pavers: 0.4 m square slabs in running rows with tone variation, 2.4 m per repeat.
export function paving() {
  return once('paving', () => {
    const rng = new RNG(97);
    const S = 1024;
    const N = 6;
    const P = S / N;
    const cloud = field(rng, 256, 5, 4, 0.55);
    const tone = Array.from({ length: N * N * 2 }, () => rng.range(-1, 1));
    const hgt = new Float32Array(S * S);
    const [c] = paint(S, S, (x, y, out) => {
      const ty = Math.floor(y / P);
      const off = ty % 2 ? P / 2 : 0;
      const xx = (x + off) % S;
      const tx = Math.floor(xx / P);
      const lx = xx - tx * P;
      const ly = y - ty * P;
      const e = Math.min(lx, P - lx, ly, P - ly);
      const t = tone[ty * N * 2 + tx];
      const n = rng.next() - 0.5;
      let v = 188 + t * 12 + (samp(cloud, x / S, y / S) - 0.5) * 22 + n * 10;
      if (e < 2) v = 128;
      out[0] = v + 4;
      out[1] = v;
      out[2] = v - 6;
      hgt[y * S + x] = e < 2 ? 0 : 0.6 + n * 0.05;
    });
    return { map: toTexture(c), normalMap: normalMap(hgt, S, S, 1.8) };
  });
}

// ---------------------------------------------------------------- per mall

const BRANDS = [
  ['VOLTA', 'ELECTRONICS'],
  ['nordik', 'HOME & LIVING'],
  ['KUMO', 'MENS FASHION'],
  ['Lumière', 'COSMETICS'],
  ['ORBIT', 'SPORTS'],
  ['fern & co', 'GARDEN'],
  ['PIXELHAUS', 'GAMES'],
  ['SOLE', 'SHOES'],
  ['Aurum', 'JEWELLERY'],
  ['ZENA', 'WOMENS FASHION'],
  ['KOI', 'SUSHI BAR'],
  ['TIDE', 'SWIMWEAR'],
  ['mint', 'PHARMACY'],
  ['BLOK', 'TOYS'],
  ['Juno', 'EYEWEAR'],
  ['EMBER', 'CAFÉ'],
];

// Shop fascia signs: 8 brands in a 2 x 4 atlas of 4:1 cells. Returns the
// texture and the brand list in atlas order.
export function signAtlas(rng, accent) {
  const W = 2048;
  const H = 2048;
  const CW = 1024;
  const CH = 256;
  const [c, g] = canvas(W, H);
  const picks = [...BRANDS].sort(() => rng.next() - 0.5).slice(0, 16);
  picks.forEach(([name, tag], i) => {
    const x = (i % 2) * CW;
    const y = Math.floor(i / 2) * CH;
    const style = rng.weighted([
      ['white', 3],
      ['black', 1.5],
      ['accent', 1.2],
    ]);
    const bg = style === 'white' ? '#f4f4f2' : style === 'black' ? '#1a1a1c' : accent;
    const fg = style === 'white' ? '#1e1e20' : '#ffffff';
    g.fillStyle = bg;
    g.fillRect(x, y, CW, CH);
    g.fillStyle = style === 'white' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
    g.fillRect(x, y + CH - 10, CW, 10);
    const weight = rng.pick(['300', '500', '700', '800']);
    const italic = rng.chance(0.25) ? 'italic ' : '';
    let size = 140;
    g.font = `${italic}${weight} ${size}px ${FONT}`;
    g.letterSpacing = rng.chance(0.5) ? '6px' : '0px';
    const tw = g.measureText(name).width;
    if (tw > CW * 0.72) {
      size = Math.floor((size * CW * 0.72) / tw);
      g.font = `${italic}${weight} ${size}px ${FONT}`;
    }
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(name, x + CW / 2, y + CH * 0.44);
    g.letterSpacing = '8px';
    g.font = `500 30px ${FONT}`;
    g.fillStyle = style === 'white' ? '#6d7074' : 'rgba(255,255,255,0.8)';
    g.fillText(tag, x + CW / 2, y + CH * 0.8);
  });
  const t = toTexture(c, { repeat: false });
  return { texture: t, brands: picks, cols: 2, rows: 8 };
}

// A hanging vertical banner: slogan running down it, mall mark at the foot.
export function banner(mall, color, slogan) {
  const w = 256;
  const h = 1024;
  const [c, g] = canvas(w, h);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  const sh = g.createLinearGradient(0, 0, w, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0.12)');
  sh.addColorStop(0.5, 'rgba(255,255,255,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
  g.save();
  g.translate(w * 0.62, h * 0.06);
  g.rotate(Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.font = `italic 800 110px ${FONT}`;
  g.fillText(slogan, 0, 0);
  g.font = `italic 400 44px ${FONT}`;
  g.fillText(mall.name.toUpperCase(), 0, 70);
  g.restore();
  g.fillStyle = '#ffffff';
  g.font = `800 120px ${FONT}`;
  g.textAlign = 'center';
  g.fillText(mall.mark, w / 2, h - 90);
  g.fillRect(40, h - 60, w - 80, 6);
  return toTexture(c, { repeat: false });
}

const ADS = [
  ['Zest!', 'Juice up your day', 'can'],
  ['Clean City!', 'Fresh air. No mess.', 'spray'],
  ['BriteSmile', 'Smile like you mean it', 'tube'],
  ['Kick Cola', 'The taste of summer', 'can'],
  ['Go Sunny', 'Holidays from 99', 'sun'],
  ['Nova Phone', 'Brighter than ever', 'phone'],
  ['Crunchies', 'Snack loud', 'bag'],
  ['FlexFit', 'Move more', 'sun'],
];

function product(g, kind, x, y, s, accent) {
  g.save();
  g.translate(x, y);
  if (kind === 'can' || kind === 'spray') {
    const h = kind === 'spray' ? s * 1.4 : s;
    g.fillStyle = '#ffffff';
    g.fillRect(-s * 0.28, -h / 2, s * 0.56, h);
    g.fillStyle = accent;
    g.fillRect(-s * 0.28, -h * 0.1, s * 0.56, h * 0.3);
    g.fillStyle = '#d8d8d8';
    g.fillRect(-s * 0.28, -h / 2, s * 0.56, s * 0.06);
    if (kind === 'spray') {
      g.fillStyle = '#222';
      g.fillRect(-s * 0.1, -h / 2 - s * 0.14, s * 0.2, s * 0.14);
    }
  } else if (kind === 'tube') {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-s * 0.2, -s * 0.5);
    g.lineTo(s * 0.2, -s * 0.5);
    g.lineTo(s * 0.12, s * 0.5);
    g.lineTo(-s * 0.12, s * 0.5);
    g.fill();
    g.fillStyle = accent;
    g.fillRect(-s * 0.18, -s * 0.2, s * 0.36, s * 0.2);
  } else if (kind === 'phone') {
    g.fillStyle = '#1b1b1d';
    g.fillRect(-s * 0.26, -s * 0.5, s * 0.52, s);
    const gr = g.createLinearGradient(-s * 0.2, -s * 0.44, s * 0.2, s * 0.44);
    gr.addColorStop(0, accent);
    gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr;
    g.fillRect(-s * 0.22, -s * 0.44, s * 0.44, s * 0.86);
  } else if (kind === 'bag') {
    g.fillStyle = '#ffffff';
    g.fillRect(-s * 0.35, -s * 0.45, s * 0.7, s * 0.9);
    g.fillStyle = accent;
    g.beginPath();
    g.arc(0, 0, s * 0.22, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, s * 0.3, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.fillRect(Math.cos(a) * s * 0.38 - 4, Math.sin(a) * s * 0.38 - 4, 8, 8);
    }
  }
  g.restore();
}

// Landscape billboard (backlit): accent ground, a slogan and a product.
export function billboard(rng, bg, accent2) {
  const w = 1024;
  const h = 384;
  const [c, g] = canvas(w, h);
  const [title, line, prod] = rng.pick(ADS);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w * 0.7, h * 0.4, 20, w * 0.7, h * 0.4, w * 0.6);
  gr.addColorStop(0, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff';
  g.font = `italic 800 ${rng.int(120, 150)}px ${FONT}`;
  g.textBaseline = 'alphabetic';
  g.fillText(title, 50, h * 0.55);
  g.font = `600 44px ${FONT}`;
  g.fillStyle = accent2;
  g.fillText(line, 56, h * 0.78);
  product(g, prod, w * 0.84, h * 0.5, h * 0.62, accent2);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 6;
  g.strokeRect(12, 12, w - 24, h - 24);
  return toTexture(c, { repeat: false });
}

const POSTERS = [
  ['Dr. Kleen', 'Recommended!'],
  ['MEGA SALE', 'up to 70% off'],
  ['The Ferns', 'Live this Friday'],
  ['New Season', 'Autumn looks'],
  ['Night Owl', 'Late opening'],
  ['FRESH', 'Food court level 2'],
];

// Portrait lightbox poster.
export function poster(rng, accent) {
  const w = 384;
  const h = 640;
  const [c, g] = canvas(w, h);
  const [title, line] = rng.pick(POSTERS);
  const dark = rng.chance(0.5);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, dark ? '#20242a' : accent);
  bg.addColorStop(1, dark ? '#4b3212' : '#ffffff');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // A figure or product silhouette.
  g.fillStyle = dark ? accent : 'rgba(0,0,0,0.75)';
  g.beginPath();
  g.arc(w / 2, h * 0.42, w * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillRect(w * 0.3, h * 0.52, w * 0.4, h * 0.3);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = `italic 800 64px ${FONT}`;
  g.fillText(title, w / 2, h * 0.14);
  g.font = `500 30px ${FONT}`;
  g.fillStyle = dark ? '#ffffff' : '#1a1a1a';
  g.fillText(line, w / 2, h * 0.92);
  return toTexture(c, { repeat: false });
}

// Mall directory screen.
export function directory(mall, accent, rng) {
  const w = 384;
  const h = 640;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#1c2026';
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(0, 0, w, 80);
  g.fillStyle = '#ffffff';
  g.font = `700 40px ${FONT}`;
  g.textAlign = 'center';
  g.fillText('DIRECTORY', w / 2, 55);
  for (let lv = 0; lv < 3; lv++) {
    const y0 = 110 + lv * 170;
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    g.strokeRect(30, y0, w - 60, 140);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = rng.chance(0.3) ? accent : 'rgba(255,255,255,0.25)';
      g.fillRect(40 + (i % 3) * 104, y0 + 10 + Math.floor(i / 3) * 42, 94, 34);
    }
  }
  g.fillStyle = accent;
  g.beginPath();
  g.arc(w * 0.5, 190, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = `500 22px ${FONT}`;
  g.fillText(mall.name, w / 2, h - 22);
  return toTexture(c, { repeat: false });
}

// The mall's name in big letters over the entrance (transparent, 8:1).
export function mallSign(mall) {
  const w = 2048;
  const h = 256;
  const [c, g] = canvas(w, h);
  g.fillStyle = '#44474c';
  g.font = `600 150px ${FONT}`;
  g.letterSpacing = '24px';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(mall.name.toUpperCase(), w / 2, h / 2 + 8);
  return toTexture(c, { repeat: false });
}

// Big mall mark (the red logo on the entrance glass), transparent.
export function mallMark(mall, color) {
  const s = 512;
  const [c, g] = canvas(s, s);
  g.fillStyle = color;
  g.font = `italic 900 300px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(mall.mark, s / 2, s / 2);
  emblem(g, s * 0.84, s * 0.2, 36, color);
  return toTexture(c, { repeat: false });
}
