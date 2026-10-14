import { describe, expect, it } from "vitest";
import { normalizePincode, PincodeDirectory, staticDirectory } from "@/lib/pincode/directory";
import { DEFAULT_ZONE_SETTINGS, resolveZone } from "@/lib/pincode/zones";

const dir = new PincodeDirectory();
const ORIGIN = "122016"; // Gurugram, Haryana

async function zoneFor(dest: string, origin = ORIGIN, settings = DEFAULT_ZONE_SETTINGS) {
  await dir.preload([origin, dest]);
  return resolveZone(dir.lookup(origin), dir.lookup(dest), settings).zone;
}

describe("pincode directory (bundled India Post data)", () => {
  it("looks up district and state", async () => {
    await dir.preload(["560034", "400070"]);
    expect(dir.lookup("560034")).toEqual({ pincode: "560034", district: "Bengaluru Urban", state: "Karnataka" });
    expect(dir.lookup("400070")?.state).toBe("Maharashtra");
  });
  it("returns null for unknown pincodes", async () => {
    await dir.preload(["999999", "000001"]);
    expect(dir.lookup("999999")).toBeNull();
    expect(dir.lookup("abc")).toBeNull();
  });
  it("normalizes messy pincodes", () => {
    expect(normalizePincode(" 110 020 ")).toBe("110020");
    expect(normalizePincode("'560034")).toBe("560034");
    expect(normalizePincode("560034.0")).toBe("560034");
    expect(normalizePincode("56003")).toBeNull();
  });
});

describe("zone rules", () => {
  it("A: within city (Delhi NCR cluster)", async () => {
    expect(await zoneFor("122001")).toBe("A"); // Gurugram
    expect(await zoneFor("110001")).toBe("A"); // New Delhi
    expect(await zoneFor("201301")).toBe("A"); // Noida
  });
  it("B: same state, different city", async () => {
    expect(await zoneFor("132001")).toBe("B"); // Karnal
    expect(await zoneFor("124001")).toBe("B"); // Rohtak
  });
  it("C: metro to metro", async () => {
    expect(await zoneFor("400001")).toBe("C");
    expect(await zoneFor("560034")).toBe("C");
    expect(await zoneFor("380015")).toBe("C"); // Ahmadabad spelling in India Post data
  });
  it("D: rest of India", async () => {
    expect(await zoneFor("226001")).toBe("D"); // Lucknow
    expect(await zoneFor("302001")).toBe("D"); // Jaipur
  });
  it("E: special states", async () => {
    expect(await zoneFor("781001")).toBe("E"); // Assam
    expect(await zoneFor("190001")).toBe("E"); // J&K
    expect(await zoneFor("194101")).toBe("E"); // Ladakh
    expect(await zoneFor("744101")).toBe("E"); // Andaman
  });
  it("within-state beats special (Guwahati → Guwahati is A, not E)", async () => {
    expect(await zoneFor("781001", "781001")).toBe("A");
  });
  it("Unknown when a pincode is not in the directory (never guessed)", async () => {
    expect(await zoneFor("999999")).toBe("Unknown");
  });
  it("respects editable settings: regions and metro list", async () => {
    const withRegion = { ...DEFAULT_ZONE_SETTINGS, regions: [["Haryana", "Punjab", "Chandigarh"]] };
    expect(await zoneFor("141001")).toBe("D");
    expect(await zoneFor("141001", ORIGIN, withRegion)).toBe("B");
    const noMetros = { ...DEFAULT_ZONE_SETTINGS, metros: [] };
    expect(await zoneFor("400001", ORIGIN, noMetros)).toBe("D");
  });
  it("works with a static directory", async () => {
    const d = staticDirectory({ "100001": { district: "X", state: "S1" }, "100002": { district: "Y", state: "S1" } });
    await d.preload(["100001", "100002"]);
    expect(resolveZone(d.lookup("100001"), d.lookup("100002"), DEFAULT_ZONE_SETTINGS).zone).toBe("B");
  });
});
