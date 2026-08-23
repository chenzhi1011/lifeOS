export function smoothTreeBranchProgress(progress: number): number {
  const bounded = Math.min(1, Math.max(0, progress));
  return bounded * bounded * (3 - 2 * bounded);
}

/**
 * Resolve the visible radius at one point along a tapered branch.
 * 计算渐细枝条在指定位置的真实可见半径，供骨架约束与 Three.js 网格共用。
 */
export function treeBranchRadiusAt(
  baseRadius: number,
  tipRadius: number,
  progress: number
): number {
  const smooth = smoothTreeBranchProgress(progress);
  return baseRadius + (tipRadius - baseRadius) * smooth;
}
