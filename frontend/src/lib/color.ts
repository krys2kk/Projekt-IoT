// Podgląd kolorów żarówki NOUS P3Z: Zigbee2MQTT raportuje kolor jako CIE 1931 {x, y}.

export interface XY {
  x: number;
  y: number;
}

function clamp(v: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, v));
}

function linearToGamma(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

export function xyToHex({ x, y }: XY): string {
  if (!y) return '#ffffff';
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  let r = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
  let g = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
  let b = X * 0.0557 - Y * 0.204 + Z * 1.057;
  const max = Math.max(r, g, b, 1e-6);
  r = linearToGamma(clamp(r / max));
  g = linearToGamma(clamp(g / max));
  b = linearToGamma(clamp(b / max));
  return rgbToHex(r * 255, g * 255, b * 255);
}

/** Przybliżony kolor bieli dla temperatury barwowej w miredach (do podglądu w UI). */
export function miredToHex(mired: number): string {
  const kelvin = 1_000_000 / mired;
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * (t - 60) ** -0.1332;
    g = 288.12 * (t - 60) ** -0.0755;
    b = 255;
  }
  return rgbToHex(r, g, b);
}

export function miredToKelvin(mired: number) {
  return Math.round(1_000_000 / mired / 50) * 50;
}
