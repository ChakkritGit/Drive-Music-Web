// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SeekSlider } from "./SeekSlider";

describe("SeekSlider", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onSeek: ReturnType<typeof vi.fn<(time: number) => void>>;

  beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    onSeek = vi.fn();
    render();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(value = 10, key = "track-a") {
    act(() => root.render(createElement(SeekSlider, { key, value, duration: 200, onSeek, className: "seek" })));
  }

  function slider() { return container.querySelector("input")!; }

  function change(value: number, type = "input") {
    // Set the native value as a browser would, bypassing React's value tracker.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider(), String(value));
    act(() => slider().dispatchEvent(new Event(type, { bubbles: true })));
  }

  function pointer(type: string, target: EventTarget = slider(), pointerId = 1) {
    act(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, button: 0 })));
  }

  function key(type: string, keyName: string, repeat = false) {
    act(() => slider().dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: keyName, repeat })));
  }

  function blur() {
    act(() => slider().dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  }

  it("previews a drag locally across playback updates and seeks once on release", () => {
    const capture = vi.fn();
    slider().setPointerCapture = capture;
    pointer("pointerdown");
    for (let time = 20; time <= 80; time += 5) change(time);
    expect(capture).toHaveBeenCalledWith(1);
    expect(onSeek).not.toHaveBeenCalled();
    expect(slider().value).toBe("80");
    expect(slider().style.getPropertyValue("--pct")).toBe("40%");

    render(11);
    expect(slider().value).toBe("80");
    pointer("pointerup");
    blur();
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(80);
  });

  it("handles release outside the slider when pointer capture is unavailable", () => {
    slider().setPointerCapture = () => { throw new Error("Pointer capture unavailable"); };
    pointer("pointerdown");
    change(120);
    pointer("pointerup", document.body, 2);
    expect(onSeek).not.toHaveBeenCalled();
    pointer("pointerup", document.body);
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(120);
  });

  it("cancels an interrupted drag without seeking", () => {
    pointer("pointerdown");
    change(90);
    pointer("pointercancel", window);
    pointer("pointerup");
    blur();
    expect(onSeek).not.toHaveBeenCalled();
    expect(slider().value).toBe("10");
  });

  it("does not seek when a pointer gesture never changes the value", () => {
    pointer("pointerdown");
    pointer("pointerup");
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("commits a held arrow key once on keyup without repeating on blur", () => {
    key("keydown", "ArrowRight");
    change(10.1);
    for (let time = 11; time <= 15; time++) {
      key("keydown", "ArrowRight", true);
      change(time);
    }
    expect(onSeek).not.toHaveBeenCalled();
    key("keyup", "ArrowRight");
    blur();
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(15);
  });

  it("commits a pending keyboard seek on blur if its keyup is missed", () => {
    key("keydown", "End");
    change(200);
    blur();
    key("keyup", "End");
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(200);
  });

  it("accepts change events from assistive technology without gesture events", () => {
    change(55, "change");
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(55);
  });

  it("discards the old track's unfinished drag when the track changes", () => {
    pointer("pointerdown");
    change(70);
    render(0, "track-b");
    pointer("pointerup", window);
    expect(onSeek).not.toHaveBeenCalled();
    expect(slider().value).toBe("0");
  });
});
