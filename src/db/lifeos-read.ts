import { buildDashboardData, buildGoalDetail } from "@/src/domain/aggregation";
import { isSupabaseAuthUserId } from "@/src/dashboard/user-id";
import { lifeOSStore } from "@/src/domain/store";
import type { Activity, Goal, InboxItem, LifeOSState } from "@/src/domain/types";
import { createServiceSupabaseClient } from "./supabase";

function emptyState(userId: string): LifeOSState {
  return {
    currentUserId: userId,
    profiles: [],
    messages: [],
    abilities: [],
    goals: [],
    goalAliases: [],
    tasks: [],
    activities: [],
    reminders: [],
    inboxItems: [],
    achievements: []
  };
}

async function readSupabaseState(userId: string): Promise<LifeOSState | null> {
  if (!isSupabaseAuthUserId(userId)) {
    return null;
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return null;
  }

  const [goalsResult, activitiesResult, inboxResult] = await Promise.all([
    supabase.from("goals").select("id,user_id,title,category,parent_goal_id,metric_type,status,created_at").eq("user_id", userId),
    supabase
      .from("activities")
      .select("id,user_id,goal_id,task_id,message_id,summary,metric_type,value,unit,occurred_on,created_at")
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false }),
    supabase.from("inbox_items").select("id,user_id,message_id,suggested_type,suggested_json,reason,status,created_at").eq("user_id", userId)
  ]);

  if (goalsResult.error || activitiesResult.error || inboxResult.error) {
    throw new Error(goalsResult.error?.message ?? activitiesResult.error?.message ?? inboxResult.error?.message ?? "failed to read dashboard data");
  }

  const state = emptyState(userId);
  state.goals = (goalsResult.data ?? []).map(
    (goal): Goal => ({
      id: goal.id,
      userId: goal.user_id,
      title: goal.title,
      category: goal.category,
      parentGoalId: goal.parent_goal_id,
      goalType: null,
      abilityId: null,
      metricType: goal.metric_type,
      status: goal.status,
      dueAt: null,
      completedAt: null,
      createdAt: goal.created_at
    })
  );
  state.activities = (activitiesResult.data ?? []).map(
    (activity): Activity => ({
      id: activity.id,
      userId: activity.user_id,
      goalId: activity.goal_id,
      taskId: activity.task_id,
      messageId: activity.message_id,
      summary: activity.summary,
      metricType: activity.metric_type,
      value: Number(activity.value),
      unit: activity.unit,
      occurredOn: activity.occurred_on,
      createdAt: activity.created_at
    })
  );
  state.inboxItems = (inboxResult.data ?? []).map(
    (item): InboxItem => ({
      id: item.id,
      userId: item.user_id,
      messageId: item.message_id,
      suggestedType: item.suggested_type,
      suggestedJson: item.suggested_json,
      reason: item.reason,
      status: item.status,
      createdAt: item.created_at
    })
  );

  return state;
}

export async function readDashboardData(userId: string) {
  const state = await readSupabaseState(userId);
  if (state) {
    return buildDashboardData(state, userId);
  }
  return lifeOSStore.getDashboardData(userId);
}

export async function readGoalDetail(goalId: string, userId: string) {
  const state = await readSupabaseState(userId);
  if (state) {
    return buildGoalDetail(state, userId, goalId);
  }
  return lifeOSStore.getGoalDetail(userId, goalId);
}
