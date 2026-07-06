// Self-contained QR code encoder (ISO/IEC 18004), byte mode, error
// correction level L, versions 1-6 -- no external dependency, since the
// shipped binary never touches the internet after build. Uses a single
// fixed mask pattern (0) rather than trying all 8 and scoring penalties:
// mask choice only affects scan robustness/aesthetics, not correctness --
// any mask is decodable as long as its number is correctly encoded in the
// format bits, which this does.

interface VersionInfo {
  size: number;
  totalCodewords: number;
  ecCodewords: number;
  dataCodewords: number;
  alignmentCenter?: number; // single alignment pattern center (v2-v6 only have one)
}

// Level L capacity table for versions 1-6 (single RS block at this level
// for all of these versions, so no block-splitting is needed).
const VERSIONS: Record<number, VersionInfo> = {
  1: { size: 21, totalCodewords: 26, ecCodewords: 7, dataCodewords: 19 },
  2: { size: 25, totalCodewords: 44, ecCodewords: 10, dataCodewords: 34, alignmentCenter: 18 },
  3: { size: 29, totalCodewords: 70, ecCodewords: 15, dataCodewords: 55, alignmentCenter: 22 },
  4: { size: 33, totalCodewords: 100, ecCodewords: 20, dataCodewords: 80, alignmentCenter: 26 },
  5: { size: 37, totalCodewords: 134, ecCodewords: 26, dataCodewords: 108, alignmentCenter: 30 },
  6: { size: 41, totalCodewords: 172, ecCodewords: 36, dataCodewords: 136, alignmentCenter: 34 },
};

const MASK_PATTERN = 0;
const EC_LEVEL_BITS = 0b01; // 'L'

// ---- GF(256) arithmetic for Reed-Solomon ----

const GF_EXP = new Array<number>(512);
const GF_LOG = new Array<number>(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function polyMul(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] = (result[i + j] ?? 0) ^ gfMul(a[i]!, b[j]!);
    }
  }
  return result;
}

function rsGeneratorPoly(ecCount: number): number[] {
  let poly: number[] = [1];
  for (let i = 0; i < ecCount; i++) {
    poly = polyMul(poly, [1, GF_EXP[i]!]);
  }
  return poly;
}

function rsEncode(dataCodewords: readonly number[], ecCount: number): number[] {
  const generator = rsGeneratorPoly(ecCount);
  const buf = [...dataCodewords, ...new Array<number>(ecCount).fill(0)];
  for (let i = 0; i < dataCodewords.length; i++) {
    const coeff = buf[i]!;
    if (coeff === 0) continue;
    for (let j = 0; j < generator.length; j++) {
      buf[i + j] = (buf[i + j] ?? 0) ^ gfMul(generator[j]!, coeff);
    }
  }
  return buf.slice(dataCodewords.length);
}

// ---- Bit buffer ----

class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }
  get length(): number {
    return this.bits.length;
  }
  toBytes(): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | (this.bits[i + j] ?? 0);
      bytes.push(byte);
    }
    return bytes;
  }
}

function chooseVersion(byteLength: number): number {
  for (let v = 1; v <= 6; v++) {
    const info = VERSIONS[v]!;
    const capacityBytes = Math.floor((info.dataCodewords * 8 - 12) / 8);
    if (byteLength <= capacityBytes) return v;
  }
  throw new Error(`Text too long for QR versions 1-6 (${byteLength} bytes)`);
}

function encodeDataCodewords(text: string, info: VersionInfo): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const bb = new BitBuffer();
  bb.put(0b0100, 4); // byte mode indicator
  bb.put(bytes.length, 8); // char count indicator (8 bits for versions 1-9)
  for (const byte of bytes) bb.put(byte, 8);

  const capacityBits = info.dataCodewords * 8;
  const terminatorLen = Math.min(4, Math.max(0, capacityBits - bb.length));
  bb.put(0, terminatorLen);
  while (bb.length % 8 !== 0) bb.bits.push(0);

  const dataBytes = bb.toBytes();
  const padBytes = [0xec, 0x11];
  let i = 0;
  while (dataBytes.length < info.dataCodewords) {
    dataBytes.push(padBytes[i % 2]!);
    i++;
  }
  return dataBytes;
}

// ---- Format info (BCH(15,5)) ----

function bchDigitCount(value: number): number {
  let digits = 0;
  let v = value;
  while (v !== 0) {
    digits++;
    v >>>= 1;
  }
  return digits;
}

const FORMAT_GENERATOR = 0b10100110111; // g(x) for BCH(15,5), degree 10
const FORMAT_GENERATOR_DIGITS = bchDigitCount(FORMAT_GENERATOR);
const FORMAT_MASK = 0b101010000010010;

function formatInfoBits(maskPattern: number): number {
  const data = (EC_LEVEL_BITS << 3) | maskPattern; // 5 bits
  let remainder = data << 10;
  while (bchDigitCount(remainder) - FORMAT_GENERATOR_DIGITS >= 0) {
    remainder ^= FORMAT_GENERATOR << (bchDigitCount(remainder) - FORMAT_GENERATOR_DIGITS);
  }
  return ((data << 10) | remainder) ^ FORMAT_MASK;
}

// ---- Module matrix ----

type Grid = boolean[][];

function makeGrid(size: number, fill = false): Grid {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(fill));
}

function placeFinderPattern(modules: Grid, reserved: Grid, top: number, left: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const row = top + r;
      const col = left + c;
      if (row < 0 || col < 0 || row >= modules.length || col >= modules.length) continue;
      reserved[row]![col] = true;
      const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      if (!inRing) {
        modules[row]![col] = false;
        continue;
      }
      const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
      const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      modules[row]![col] = isBorder || isCore;
    }
  }
}

function placeAlignmentPattern(modules: Grid, reserved: Grid, center: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const row = center + r;
      const col = center + c;
      reserved[row]![col] = true;
      const isBorder = r === -2 || r === 2 || c === -2 || c === 2;
      const isCore = r === 0 && c === 0;
      modules[row]![col] = isBorder || isCore;
    }
  }
}

function placeTimingPatterns(modules: Grid, reserved: Grid, size: number): void {
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    modules[6]![i] = dark;
    reserved[6]![i] = true;
    modules[i]![6] = dark;
    reserved[i]![6] = true;
  }
}

function reserveFormatAreas(reserved: Grid, size: number): void {
  for (let i = 0; i <= 8; i++) {
    reserved[8]![i] = true;
    reserved[i]![8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8]![size - 1 - i] = true;
    reserved[size - 1 - i]![8] = true;
  }
}

function placeFormatInfo(modules: Grid, size: number, bits: number): void {
  const get = (i: number) => ((bits >> i) & 1) === 1;

  // Vertical strip: top-left copy (rows 0-5,7,8 of column 8) then the
  // bottom-left copy (bottom 7 rows of column 8).
  for (let i = 0; i < 15; i++) {
    const val = get(i);
    if (i < 6) modules[i]![8] = val;
    else if (i < 8) modules[i + 1]![8] = val;
    else modules[size - 15 + i]![8] = val;
  }

  // Horizontal strip: top-right copy (row 8, rightmost 8 columns) then the
  // top-left copy (row 8, columns 5 down to 0, skipping the timing column).
  for (let i = 0; i < 15; i++) {
    const val = get(i);
    if (i < 8) modules[8]![size - i - 1] = val;
    else if (i < 9) modules[8]![15 - i - 1 + 1] = val;
    else modules[8]![15 - i - 1] = val;
  }

  // The single always-dark module.
  modules[size - 8]![8] = true;
}

function placeData(modules: Grid, reserved: Grid, size: number, dataBytes: readonly number[]): void {
  const bits: number[] = [];
  for (const byte of dataBytes) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);

  let bitIndex = 0;
  let upward = true;
  let col = size - 1;
  while (col > 0) {
    if (col === 6) col--; // the whole column is the vertical timing pattern -- skip it
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (reserved[row]![c]) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex]! : 0;
        bitIndex++;
        const masked = (row + c) % 2 === 0 ? bit ^ 1 : bit;
        modules[row]![c] = masked === 1;
      }
    }
    upward = !upward;
    col -= 2;
  }
}

export function generateQrMatrix(text: string): boolean[][] {
  const byteLength = new TextEncoder().encode(text).length;
  const version = chooseVersion(byteLength);
  const info = VERSIONS[version]!;
  const size = info.size;

  const modules = makeGrid(size);
  const reserved = makeGrid(size);

  placeFinderPattern(modules, reserved, 0, 0);
  placeFinderPattern(modules, reserved, 0, size - 7);
  placeFinderPattern(modules, reserved, size - 7, 0);
  if (info.alignmentCenter !== undefined) placeAlignmentPattern(modules, reserved, info.alignmentCenter);
  placeTimingPatterns(modules, reserved, size);
  reserveFormatAreas(reserved, size);

  const dataCodewords = encodeDataCodewords(text, info);
  const ecCodewords = rsEncode(dataCodewords, info.ecCodewords);
  const allCodewords = [...dataCodewords, ...ecCodewords];

  placeData(modules, reserved, size, allCodewords);
  placeFormatInfo(modules, size, formatInfoBits(MASK_PATTERN));

  return modules;
}

export function qrToAsciiArt(matrix: boolean[][]): string {
  const size = matrix.length;
  const quiet = 2;
  const lines: string[] = [];
  for (let r = -quiet; r < size + quiet; r += 2) {
    let line = '';
    for (let c = -quiet; c < size + quiet; c++) {
      const top = r >= 0 && r < size && c >= 0 && c < size ? matrix[r]![c]! : false;
      const bottom = r + 1 >= 0 && r + 1 < size && c >= 0 && c < size ? matrix[r + 1]![c]! : false;
      if (top && bottom) line += '█';
      else if (top) line += '▀';
      else if (bottom) line += '▄';
      else line += ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function qrToSvg(matrix: boolean[][], moduleSize = 6): string {
  const size = matrix.length;
  const quiet = 2;
  const totalModules = size + quiet * 2;
  const px = totalModules * moduleSize;
  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r]![c]) continue;
      const x = (c + quiet) * moduleSize;
      const y = (r + quiet) * moduleSize;
      rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" />`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" shape-rendering="crispEdges">` +
    `<rect width="${px}" height="${px}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
  );
}
