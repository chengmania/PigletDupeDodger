export interface BandDef {
  id: string;
  label: string;
  // Cabrillo QSO: line frequency field. Satellite has no established numeric
  // kHz convention for FD Cabrillo submissions, so it uses the literal token.
  cabrilloFreqKhz: number | 'SAT';
  // Present only for bands >=50MHz, used to filter the Free VHF station
  // view (Rule 4.1.2) to VHF/UHF bands only.
  minMhz?: number;
}

// No WARC bands (12/17/30m) -- not eligible Field Day bands.
export const BANDS: BandDef[] = [
  { id: '160m', label: '160m', cabrilloFreqKhz: 1800 },
  { id: '80m', label: '80m', cabrilloFreqKhz: 3500 },
  { id: '40m', label: '40m', cabrilloFreqKhz: 7000 },
  { id: '20m', label: '20m', cabrilloFreqKhz: 14000 },
  { id: '15m', label: '15m', cabrilloFreqKhz: 21000 },
  { id: '10m', label: '10m', cabrilloFreqKhz: 28000 },
  { id: '6m', label: '6m', cabrilloFreqKhz: 50000, minMhz: 50 },
  { id: '2m', label: '2m', cabrilloFreqKhz: 144000, minMhz: 144 },
  { id: '70cm', label: '70cm', cabrilloFreqKhz: 432000, minMhz: 432 },
  { id: 'SAT', label: 'Satellite', cabrilloFreqKhz: 'SAT' },
];

export const BAND_IDS: string[] = BANDS.map((b) => b.id);

// Bands eligible for the Free VHF station (Class A/F only, Rule 4.1.2).
export const VHF_UP_BAND_IDS: string[] = BANDS.filter((b) => b.minMhz !== undefined).map((b) => b.id);

export function getBand(id: string): BandDef | undefined {
  return BANDS.find((b) => b.id === id);
}
