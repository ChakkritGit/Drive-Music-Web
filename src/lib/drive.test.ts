import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFileFresh } from "@/lib/drive";
import type { DriveFile } from "@/types";

const file = { id: "f1", name: "a.mp3", mimeType: "audio/mpeg" } as DriveFile;

function fetchReturning(...statuses: number[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push((init.headers as Record<string, string>).Authorization);
      const status = statuses.shift() ?? 200;
      return new Response(status === 200 ? "bytes" : "no", { status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("downloadFileFresh", () => {
  it("downloads with the token it was given", async () => {
    const calls = fetchReturning(200);
    const refresh = vi.fn();
    const blob = await downloadFileFresh("old", file, refresh);
    expect(blob.type).toBe("audio/mpeg");
    expect(calls).toEqual(["Bearer old"]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("retries once with a fresh token after a 401", async () => {
    const calls = fetchReturning(401, 200);
    await downloadFileFresh("old", file, async () => "new");
    expect(calls).toEqual(["Bearer old", "Bearer new"]);
  });

  it("gives up when the refresh returns nothing or the same token", async () => {
    fetchReturning(401);
    await expect(downloadFileFresh("old", file, async () => undefined)).rejects.toMatchObject({ status: 401 });
    fetchReturning(401);
    await expect(downloadFileFresh("old", file, async () => "old")).rejects.toMatchObject({ status: 401 });
  });

  it("does not refresh on other errors", async () => {
    fetchReturning(404);
    const refresh = vi.fn();
    await expect(downloadFileFresh("old", file, refresh)).rejects.toMatchObject({ status: 404 });
    expect(refresh).not.toHaveBeenCalled();
  });
});
