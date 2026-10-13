// Approximate coordinates for Ghana locations used in supplier records.
// Area table is checked first (most specific match wins), then the city
// centre, then Accra as the final fallback. A small deterministic jitter
// (seeded by the supplier id) separates co-located markers on the map.

const CITY_CENTERS: [string, number, number][] = [
  ['accra', 5.6037, -0.187],
  ['tema', 5.6699, -0.0166],
  ['kumasi', 6.6885, -1.6244],
  ['greater accra', 5.65, -0.19],
  ['takoradi', 4.898, -1.76],
];

// Specific areas first — order matters (substring checks run top to bottom).
const AREAS: [string, number, number][] = [
  ['south industrial', 5.56, -0.18],
  ['industrial area', 5.66, 0.01],
  ['suame magazine', 6.73, -1.638],
  ['opera square', 5.548, -0.21],
  ['community 25', 5.68, -0.02],
  ['comm. 1', 5.65, -0.01],
  ['east legon', 5.635, -0.163],
  ['nii sai', 5.635, -0.163],
  ['tudu', 5.5484, -0.2204],
  ['adenta', 5.775, -0.152],
  ['suame', 6.725, -1.63],
  ['lapaz', 5.605, -0.258],
  ['asafo', 6.69, -1.625],
  ['adum', 6.69, -1.624],
  ['spintex', 5.63, -0.1],
  ['knust', 6.69, -1.56],
  ['kaneshie', 5.57, -0.235],
  ['dansoman', 5.535, -0.26],
  ['mcdoom', 5.64, -0.19],
  ['shai hills', 5.9, -0.05],
  ['madina', 5.67, -0.17],
  ['agbon boi', 5.55, -0.215],
  ['hatso', 5.56, -0.19],
  ['nima', 5.575, -0.183],
  ['dr. busia', 5.67, -0.03],
];

/** Tiny deterministic hash → jitter offset in ±spread degrees. */
function jitter(seed: string, spread = 0.008): [number, number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = ((h & 0xffff) / 0xffff - 0.5) * 2 * spread;
  const b = ((((h >> 16) & 0xffff) / 0xffff) - 0.5) * 2 * spread;
  return [a, b];
}

export function coordsFor(location: string, city: string, seed: string): { lat: number; lng: number } {
  const loc = location.toLowerCase();
  let lat = 5.6037;
  let lng = -0.187;

  for (const [key, a, l] of AREAS) {
    if (loc.includes(key)) {
      lat = a;
      lng = l;
      break;
    }
  }
  if (!AREAS.some(([key]) => loc.includes(key))) {
    const cityKey = city.toLowerCase();
    for (const [key, a, l] of CITY_CENTERS) {
      if (cityKey.includes(key) || cityKey === key) {
        lat = a;
        lng = l;
        break;
      }
    }
  }

  const [jLat, jLng] = jitter(seed);
  return { lat: lat + jLat, lng: lng + jLng };
}
