// Sortable id generator: a 48-bit millisecond timestamp (12 hex chars) followed
// by a monotonic same-millisecond counter (4 hex chars) followed by random
// entropy (16 hex chars). No external uuid dependency, since the shipped
// binary never touches the internet again after build.
let lastMs = 0;
let counter = 0;

export function generateId(): string {
  let ms = Date.now();
  if (ms <= lastMs) {
    ms = lastMs;
    counter = (counter + 1) & 0xffff;
  } else {
    lastMs = ms;
    counter = 0;
  }

  const tsHex = ms.toString(16).padStart(12, '0');
  const counterHex = counter.toString(16).padStart(4, '0');

  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  return `${tsHex}${counterHex}${randomHex}`;
}
