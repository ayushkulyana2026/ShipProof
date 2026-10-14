/** One preprocessed chunk of the pincode directory (all pincodes sharing the first two digits). */
export type PincodeChunk = {
  states: string[];
  /** [district name, index into states] */
  districts: [string, number][];
  /** pincode → index into districts */
  pins: Record<string, number>;
};

export type PincodeInfo = {
  pincode: string;
  /** District as published by India Post (e.g. "Bengaluru Urban"). */
  district: string;
  state: string;
};
