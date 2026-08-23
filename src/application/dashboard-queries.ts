import { readDashboardData, readGoalDetail } from "@/src/db/lifeos-read";
import type { ApiPrincipal } from "@/src/auth/api-principal";

export function queryDashboard(principal: ApiPrincipal, asOf = new Date()) {
  return readDashboardData(principal.userId, asOf);
}
export function queryGoalDetail(principal: ApiPrincipal, goalId: string, asOf = new Date()) {
  return readGoalDetail(goalId, principal.userId, asOf);
}
