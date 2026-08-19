export const GROWTH_TREE_CAMERA_LIMITS = {
  // 45° from the vertical axis means at most a 45° top-down view.
  // 从竖直轴向下 45°，对应最大 45° 俯视。
  minimumPolarAngle: Math.PI / 4,
  // 90° horizon + 30° upward viewing allowance.
  // 水平视角 90° 加 30°，对应最大 30° 仰视。
  maximumUserPolarAngle: Math.PI * 2 / 3,
  minimumAzimuthAngle: Number.NEGATIVE_INFINITY,
  maximumAzimuthAngle: Number.POSITIVE_INFINITY,
  minimumCameraY: 0.25
} as const;

export function resolveMaximumPolarAngle(input: {
  distance: number;
  targetY: number;
}): number {
  if (!Number.isFinite(input.distance) || input.distance <= 0) {
    throw new Error("camera orbit distance must be a finite positive number");
  }
  if (!Number.isFinite(input.targetY)) {
    throw new Error("camera targetY must be finite");
  }

  // cameraY = targetY + distance * cos(polarAngle)
  // Rearranging gives the lowest safe polar angle for the current zoom distance.
  // 由相机高度公式反推当前缩放距离下不会穿地的最大极角。
  const groundRatio = Math.min(1, Math.max(-1,
    (GROWTH_TREE_CAMERA_LIMITS.minimumCameraY - input.targetY)
      / input.distance
  ));
  const groundSafeAngle = Math.acos(groundRatio);
  return Math.min(
    GROWTH_TREE_CAMERA_LIMITS.maximumUserPolarAngle,
    groundSafeAngle
  );
}
