import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FREE_RIDE_STORAGE_KEY,
  GUEST_TRACKING_USER_ID,
  adoptGuestTrackingSnapshot,
  clearTrackingSnapshot,
  loadTrackingSnapshot,
  saveTrackingSnapshot,
  type TrackingSnapshot,
} from "@/lib/trackingStorage";

// Minimaler localStorage-Ersatz — die Tests laufen in der Node-Umgebung.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  get size(): number {
    return this.store.size;
  }
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

function snapshot(overrides: Partial<TrackingSnapshot> = {}): TrackingSnapshot {
  return {
    phase: "finished",
    trail: [{ lng: 8.5, lat: 47.37, t: 1000 }],
    distanceKm: 12.3,
    hasStarted: true,
    hasLeftStart: true,
    startTimeMs: Date.now() - 3600_000,
    savedAt: Date.now(),
    seconds: 3600,
    ...overrides,
  };
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});

describe("trackingStorage", () => {
  it("returns a snapshot to the user who saved it", () => {
    saveTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY, snapshot());
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)?.distanceKm).toBe(12.3);
  });

  // Der Kern: auf einem geteilten Gerät darf eine abgebrochene Aufzeichnung
  // nicht dem nächsten angemeldeten Nutzer angeboten werden — sie enthält
  // den vollständigen GPS-Verlauf und liesse sich unter dessen Konto
  // speichern. localStorage überlebt das Abmelden.
  it("does not hand a snapshot to a different user on the same browser", () => {
    saveTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY, snapshot());
    expect(loadTrackingSnapshot(USER_B, FREE_RIDE_STORAGE_KEY)).toBeNull();
  });

  it("keeps route rides and free rides apart", () => {
    saveTrackingSnapshot(USER_A, "route-id", snapshot({ distanceKm: 5 }));
    saveTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY, snapshot({ distanceKm: 42 }));
    expect(loadTrackingSnapshot(USER_A, "route-id")?.distanceKm).toBe(5);
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)?.distanceKm).toBe(42);
  });

  it("drops a snapshot that is older than a day instead of reviving it", () => {
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
    saveTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY, snapshot({ savedAt: twoDaysAgo }));
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBeNull();
    // Und wird dabei auch entfernt, statt bei jedem Öffnen erneut zu prüfen.
    expect(storage.size).toBe(0);
  });

  it("clears only the snapshot it was asked to clear", () => {
    saveTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY, snapshot());
    saveTrackingSnapshot(USER_B, FREE_RIDE_STORAGE_KEY, snapshot());
    clearTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY);
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBeNull();
    expect(loadTrackingSnapshot(USER_B, FREE_RIDE_STORAGE_KEY)).not.toBeNull();
  });

  // Eine als Gast aufgezeichnete Fahrt gehört bis zur Anmeldung niemandem —
  // erst das Konto, das sich ausdrücklich dafür anmeldet, übernimmt sie.
  it("hands a guest recording over to the account that signs in for it", () => {
    saveTrackingSnapshot(GUEST_TRACKING_USER_ID, FREE_RIDE_STORAGE_KEY, snapshot({ distanceKm: 7 }));

    expect(adoptGuestTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBe(true);
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)?.distanceKm).toBe(7);
    // Und liegt danach nicht mehr unter dem Gast-Schlüssel, wo sie dem
    // nächsten Konto auf demselben Gerät angeboten werden könnte.
    expect(loadTrackingSnapshot(GUEST_TRACKING_USER_ID, FREE_RIDE_STORAGE_KEY)).toBeNull();
  });

  it("has nothing to adopt when no guest recording exists", () => {
    expect(adoptGuestTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBe(false);
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBeNull();
  });

  // Die eigene unterbrochene Aufzeichnung ist die relevantere — eine
  // Gastfahrt darf sie nicht überschreiben.
  it("keeps an own interrupted recording instead of overwriting it with a guest one", () => {
    saveTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY, snapshot({ distanceKm: 42 }));
    saveTrackingSnapshot(GUEST_TRACKING_USER_ID, FREE_RIDE_STORAGE_KEY, snapshot({ distanceKm: 7 }));

    expect(adoptGuestTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBe(false);
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)?.distanceKm).toBe(42);
  });

  it("does not revive an expired guest recording", () => {
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
    saveTrackingSnapshot(
      GUEST_TRACKING_USER_ID,
      FREE_RIDE_STORAGE_KEY,
      snapshot({ savedAt: twoDaysAgo }),
    );

    expect(adoptGuestTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBe(false);
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBeNull();
  });

  it("survives a storage that throws (private browsing, quota)", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    });
    expect(() => saveTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY, snapshot())).not.toThrow();
    expect(loadTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).toBeNull();
    expect(() => clearTrackingSnapshot(USER_A, FREE_RIDE_STORAGE_KEY)).not.toThrow();
  });
});
