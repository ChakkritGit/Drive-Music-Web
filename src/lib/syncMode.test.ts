import { describe, expect, it } from "vitest";
import { syncMode } from "@/lib/syncMode";

const leading = (deviceId: string, leadSince: number) => ({ deviceId, audioOn: deviceId, leadSince });

describe("syncMode", () => {
  it("plays alone by default", () => {
    expect(syncMode({ chosen: "solo", leadSince: 0, optedOutOf: null, remote: null }).mode).toBe("solo");
  });

  it("follows, silently, a device that leads", () => {
    expect(syncMode({ chosen: "solo", leadSince: 0, optedOutOf: null, remote: leading("b", 100) })).toEqual({ mode: "follow", leaderId: "b" });
  });

  it("does not follow a device that only repeats someone else's lead", () => {
    const echo = { deviceId: "b", audioOn: "a", leadSince: undefined };
    expect(syncMode({ chosen: "solo", leadSince: 0, optedOutOf: null, remote: echo }).mode).toBe("solo");
  });

  it("leads when chosen and nobody else does", () => {
    expect(syncMode({ chosen: "lead", leadSince: 50, optedOutOf: null, remote: null }).mode).toBe("lead");
  });

  it("two leaders: the later choice wins", () => {
    expect(syncMode({ chosen: "lead", leadSince: 200, optedOutOf: null, remote: leading("b", 100) }).mode).toBe("lead");
    expect(syncMode({ chosen: "lead", leadSince: 50, optedOutOf: null, remote: leading("b", 100) }).mode).toBe("follow");
  });

  it("stepping out of a lead stays out of it, but a new lead is followed again", () => {
    expect(syncMode({ chosen: "solo", leadSince: 0, optedOutOf: 100, remote: leading("b", 100) }).mode).toBe("solo");
    expect(syncMode({ chosen: "solo", leadSince: 0, optedOutOf: 100, remote: leading("b", 300) }).mode).toBe("follow");
  });
});
