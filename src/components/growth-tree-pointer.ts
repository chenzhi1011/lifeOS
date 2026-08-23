export type PointerGestureSample = {
  pointerId: number;
  clientX: number;
  clientY: number;
  pointerType: string;
  isPrimary: boolean;
  button: number;
};

export type PointerGestureState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  maxDistance: number;
  accumulatedDistance: number;
  clickEligible: boolean;
};

export type PointerGestureEnd = {
  state: PointerGestureState | null;
  matched: boolean;
  isClick: boolean;
};

export type PointerGestureCancel = Omit<PointerGestureEnd, "isClick">;

const CLICK_DISTANCE = 5;

function distance(
  leftX: number,
  leftY: number,
  rightX: number,
  rightY: number
): number {
  return Math.hypot(rightX - leftX, rightY - leftY);
}

export function beginPointerGesture(
  state: PointerGestureState | null,
  sample: PointerGestureSample
): PointerGestureState | null {
  if (state !== null) {
    return state.pointerId !== sample.pointerId && state.clickEligible
      ? { ...state, clickEligible: false }
      : state;
  }
  if (
    !sample.isPrimary ||
    (sample.pointerType === "mouse" && sample.button !== 0)
  ) {
    return state;
  }
  return {
    pointerId: sample.pointerId,
    startX: sample.clientX,
    startY: sample.clientY,
    lastX: sample.clientX,
    lastY: sample.clientY,
    maxDistance: 0,
    accumulatedDistance: 0,
    clickEligible: true
  };
}

export function movePointerGesture(
  state: PointerGestureState | null,
  sample: PointerGestureSample
): PointerGestureState | null {
  if (!state || state.pointerId !== sample.pointerId) {
    return state;
  }
  return {
    ...state,
    lastX: sample.clientX,
    lastY: sample.clientY,
    maxDistance: Math.max(
      state.maxDistance,
      distance(state.startX, state.startY, sample.clientX, sample.clientY)
    ),
    accumulatedDistance:
      state.accumulatedDistance +
      distance(state.lastX, state.lastY, sample.clientX, sample.clientY)
  };
}

export function endPointerGesture(
  state: PointerGestureState | null,
  sample: PointerGestureSample
): PointerGestureEnd {
  if (!state || state.pointerId !== sample.pointerId) {
    return { state, matched: false, isClick: false };
  }
  const completed = movePointerGesture(state, sample)!;
  return {
    state: null,
    matched: true,
    isClick:
      completed.clickEligible &&
      completed.maxDistance < CLICK_DISTANCE &&
      completed.accumulatedDistance < CLICK_DISTANCE
  };
}

export function cancelPointerGesture(
  state: PointerGestureState | null,
  pointerId: number
): PointerGestureCancel {
  if (!state || state.pointerId !== pointerId) {
    return { state, matched: false };
  }
  return { state: null, matched: true };
}
