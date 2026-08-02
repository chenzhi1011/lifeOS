import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as pointerGesture from "@/src/components/growth-tree-pointer";

type PointerSample = {
  pointerId: number;
  clientX: number;
  clientY: number;
  pointerType: string;
  isPrimary: boolean;
  button: number;
};

type PointerGestureState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  maxDistance: number;
  accumulatedDistance: number;
};

type PointerGestureResult = {
  state: PointerGestureState | null;
  matched: boolean;
  isClick: boolean;
};

type PointerGestureApi = {
  beginPointerGesture: (
    state: PointerGestureState | null,
    sample: PointerSample
  ) => PointerGestureState | null;
  movePointerGesture: (
    state: PointerGestureState | null,
    sample: PointerSample
  ) => PointerGestureState | null;
  endPointerGesture: (
    state: PointerGestureState | null,
    sample: PointerSample
  ) => PointerGestureResult;
  cancelPointerGesture: (
    state: PointerGestureState | null,
    pointerId: number
  ) => Omit<PointerGestureResult, "isClick">;
};

function gestureApi(): PointerGestureApi | null {
  const candidate = pointerGesture as typeof pointerGesture &
    Partial<PointerGestureApi>;
  const complete =
    typeof candidate.beginPointerGesture === "function" &&
    typeof candidate.movePointerGesture === "function" &&
    typeof candidate.endPointerGesture === "function" &&
    typeof candidate.cancelPointerGesture === "function";
  return complete ? (candidate as PointerGestureApi) : null;
}

function sample(
  pointerId: number,
  clientX: number,
  clientY: number,
  overrides: Partial<PointerSample> = {}
): PointerSample {
  return {
    pointerId,
    clientX,
    clientY,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    ...overrides
  };
}

describe("growth tree pointer gesture", () => {
  it("has an isolated pure gesture module", () => {
    expect(
      existsSync(path.resolve("src/components/growth-tree-pointer.ts"))
    ).toBe(true);
  });

  it("classifies a short primary movement as one click and clears state", () => {
    const api = gestureApi();
    expect(api).not.toBeNull();
    if (!api) return;

    const begun = api.beginPointerGesture(null, sample(1, 10, 10));
    const moved = api.movePointerGesture(begun, sample(1, 12, 11));
    const ended = api.endPointerGesture(moved, sample(1, 13, 12));

    expect(ended).toMatchObject({ matched: true, isClick: true, state: null });
  });

  it("rejects out-and-back and accumulated jitter gestures", () => {
    const api = gestureApi();
    expect(api).not.toBeNull();
    if (!api) return;

    const begun = api.beginPointerGesture(null, sample(1, 0, 0));
    const movedOut = api.movePointerGesture(begun, sample(1, 4, 0));
    const movedBack = api.movePointerGesture(movedOut, sample(1, 0, 0));
    const ended = api.endPointerGesture(movedBack, sample(1, 0, 0));

    expect(movedBack?.maxDistance).toBe(4);
    expect(movedBack?.accumulatedDistance).toBe(8);
    expect(ended).toMatchObject({ matched: true, isClick: false, state: null });
  });

  it("ignores mismatched move and up events without clearing the owner", () => {
    const api = gestureApi();
    expect(api).not.toBeNull();
    if (!api) return;

    const begun = api.beginPointerGesture(null, sample(1, 0, 0));
    const mismatchedMove = api.movePointerGesture(begun, sample(2, 20, 20));
    const mismatchedUp = api.endPointerGesture(
      mismatchedMove,
      sample(2, 20, 20)
    );

    expect(mismatchedMove).toBe(begun);
    expect(mismatchedUp).toEqual({
      state: begun,
      matched: false,
      isClick: false
    });
  });

  it("does not let a second pointer or pinch replace the primary owner", () => {
    const api = gestureApi();
    expect(api).not.toBeNull();
    if (!api) return;

    const begun = api.beginPointerGesture(
      null,
      sample(1, 0, 0, { pointerType: "touch" })
    );
    const second = api.beginPointerGesture(
      begun,
      sample(2, 10, 10, {
        pointerType: "touch",
        isPrimary: false
      })
    );
    const anotherPrimary = api.beginPointerGesture(
      second,
      sample(3, 10, 10, { pointerType: "pen" })
    );

    expect(second).toBe(begun);
    expect(anotherPrimary).toBe(begun);
  });

  it("only matching cancellation clears the gesture", () => {
    const api = gestureApi();
    expect(api).not.toBeNull();
    if (!api) return;

    const begun = api.beginPointerGesture(null, sample(1, 0, 0));
    expect(api.cancelPointerGesture(begun, 2)).toEqual({
      state: begun,
      matched: false
    });
    expect(api.cancelPointerGesture(begun, 1)).toEqual({
      state: null,
      matched: true
    });
  });

  it("rejects right-click and non-primary starts but accepts primary touch and pen", () => {
    const api = gestureApi();
    expect(api).not.toBeNull();
    if (!api) return;

    expect(
      api.beginPointerGesture(null, sample(1, 0, 0, { button: 2 }))
    ).toBeNull();
    expect(
      api.beginPointerGesture(
        null,
        sample(2, 0, 0, { pointerType: "touch", isPrimary: false })
      )
    ).toBeNull();
    expect(
      api.beginPointerGesture(
        null,
        sample(3, 0, 0, { pointerType: "touch", button: 2 })
      )?.pointerId
    ).toBe(3);
    expect(
      api.beginPointerGesture(
        null,
        sample(4, 0, 0, { pointerType: "pen", button: 2 })
      )?.pointerId
    ).toBe(4);
  });
});
