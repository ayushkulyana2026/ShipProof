import type { ResolvedZone } from "../types";
import type { PincodeInfo } from "./types";

export type MetroCity = {
  name: string;
  /** Whole states that belong to this metro (e.g. Delhi). */
  states: string[];
  /** Districts (India Post names) that belong to this metro. */
  districts: string[];
};

export type ZoneSettings = {
  metros: MetroCity[];
  /** Destination states billed as Zone E (special). */
  specialStates: string[];
  /** Optional groups of states treated as one region for Zone B. Same state always counts. */
  regions: string[][];
};

export const DEFAULT_METROS: MetroCity[] = [
  { name: "Delhi NCR", states: ["Delhi"], districts: ["Gurugram", "Gurgaon", "Gautam Buddha Nagar", "Ghaziabad", "Faridabad"] },
  { name: "Mumbai", states: [], districts: ["Mumbai", "Mumbai Suburban", "Thane"] },
  { name: "Bengaluru", states: [], districts: ["Bengaluru Urban", "Bangalore", "Bengaluru Rural"] },
  { name: "Chennai", states: [], districts: ["Chennai"] },
  { name: "Kolkata", states: [], districts: ["Kolkata", "Howrah"] },
  { name: "Hyderabad", states: [], districts: ["Hyderabad", "Ranga Reddy", "Medchal Malkajgiri"] },
  { name: "Pune", states: [], districts: ["Pune"] },
  { name: "Ahmedabad", states: [], districts: ["Ahmadabad", "Ahmedabad"] },
];

export const DEFAULT_SPECIAL_STATES: string[] = [
  "Arunachal Pradesh",
  "Assam",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Sikkim",
  "Tripura",
  "Jammu and Kashmir",
  "Ladakh",
  "Andaman and Nicobar Islands",
  "Lakshadweep",
];

export const DEFAULT_ZONE_SETTINGS: ZoneSettings = {
  metros: DEFAULT_METROS,
  specialStates: DEFAULT_SPECIAL_STATES,
  regions: [],
};

export const ZONE_LABELS: Record<ResolvedZone, string> = {
  A: "Within city",
  B: "Within region",
  C: "Metro to metro",
  D: "Rest of India",
  E: "Special (NE / J&K / islands)",
  Unknown: "Unknown",
};

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

export function metroOf(info: PincodeInfo, settings: ZoneSettings): MetroCity | null {
  const d = norm(info.district);
  const s = norm(info.state);
  return (
    settings.metros.find((m) => m.states.some((x) => norm(x) === s) || m.districts.some((x) => norm(x) === d)) ?? null
  );
}

/** City used for the "within city" rule: the metro cluster name if the district is in one, else the district. */
export function cityOf(info: PincodeInfo, settings: ZoneSettings): string {
  return metroOf(info, settings)?.name ?? info.district;
}

function sameRegion(a: PincodeInfo, b: PincodeInfo, settings: ZoneSettings): boolean {
  if (norm(a.state) === norm(b.state)) return true;
  return settings.regions.some((group) => {
    const g = group.map(norm);
    return g.includes(norm(a.state)) && g.includes(norm(b.state));
  });
}

export type ZoneResolution = { zone: ResolvedZone; reason: string };

/**
 * Precedence: A (same city) → B (same state/region) → E (special destination)
 * → C (metro to metro) → D (rest of India). Unknown pincodes → "Unknown" (never guessed).
 */
export function resolveZone(origin: PincodeInfo | null, dest: PincodeInfo | null, settings: ZoneSettings): ZoneResolution {
  if (!origin) return { zone: "Unknown", reason: "Origin pincode not found in the India Post directory" };
  if (!dest) return { zone: "Unknown", reason: "Destination pincode not found in the India Post directory" };
  const oc = cityOf(origin, settings);
  const dc = cityOf(dest, settings);
  if (norm(oc) === norm(dc)) return { zone: "A", reason: `Both pincodes are in ${dc}` };
  if (sameRegion(origin, dest, settings)) {
    return {
      zone: "B",
      reason:
        norm(origin.state) === norm(dest.state)
          ? `Different city, same state (${dest.state})`
          : `${origin.state} and ${dest.state} are in the same region`,
    };
  }
  if (settings.specialStates.some((s) => norm(s) === norm(dest.state))) {
    return { zone: "E", reason: `${dest.state} is a special-zone state` };
  }
  const om = metroOf(origin, settings);
  const dm = metroOf(dest, settings);
  if (om && dm) return { zone: "C", reason: `Metro to metro (${om.name} → ${dm.name})` };
  return { zone: "D", reason: `Rest of India (${oc}, ${origin.state} → ${dc}, ${dest.state})` };
}
