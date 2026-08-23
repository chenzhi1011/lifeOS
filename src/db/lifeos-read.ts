import {
  buildDashboardData,
  buildGoalDetail,
  dashboardWindowStart
} from "@/src/domain/aggregation";
import { isSupabaseAuthUserId } from "@/src/dashboard/user-id";
import { lifeOSStore } from "@/src/domain/store";
import type {
  Activity,
  Achievement,
  Goal,
  InboxItem,
  LifeOSState,
  Task
} from "@/src/domain/types";
import { isLifeAreaId } from "@/src/domain/life-areas";
import { createServiceSupabaseClient } from "./supabase";

function emptyState(userId: string): LifeOSState {
  return {
    currentUserId: userId,
    profiles: [],
    messages: [],
    goals: [],
    goalAliases: [],
    tasks: [],
    activities: [],
    reminders: [],
    inboxItems: [],
    achievements: []
  };
}

async function readSupabaseState(
  userId: string,
  asOf: Date
): Promise<LifeOSState | null> {
  if (!isSupabaseAuthUserId(userId)) {
    return null;
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return null;
  }

  const [
    goalsResult,
    activitiesResult,
    tasksResult,
    achievementsResult,
    inboxResult
  ] = await Promise.all([
    supabase
      .from("goals")
      .select("id,user_id,title,goal_type,life_area,metric_type,status,due_at,completed_at,created_at")
      .eq("user_id", userId),
    supabase
      .from("activities")
      .select("id,user_id,goal_id,task_id,source_message_id,summary,metric_type,value,unit,occurred_on,created_at")
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false }),
    supabase
      .from("tasks")
      .select("id,user_id,goal_id,source_message_id,title,status,due_at,priority,planned_metric_type,planned_value,planned_unit,created_at,completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .is("goal_id", null)
      .gte("completed_at", dashboardWindowStart(asOf))
      .order("completed_at", { ascending: false }),
    supabase
      .from("achievements")
      .select("id,user_id,short_goal_id,title,metric_type,threshold_value,note,evidence_url,achieved_at,created_at")
      .eq("user_id", userId)
      .order("achieved_at", { ascending: false }),
    supabase
      .from("inbox_items")
      .select("id,user_id,message_id,suggested_type,suggested_json,reason,status,created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
  ]);

  const readError =
    goalsResult.error ??
    activitiesResult.error ??
    tasksResult.error ??
    achievementsResult.error ??
    inboxResult.error;
  if (readError) {
    throw new Error(readError.message ?? "failed to read dashboard data");
  }

  const state = emptyState(userId);
  state.goals = (goalsResult.data ?? []).map(
    (goal): Goal => {
      if (!isLifeAreaId(goal.life_area)) {
        throw new Error(`invalid life_area for goal ${goal.id}`);
      }
      if (goal.goal_type !== "long_term" && goal.goal_type !== "short_term") {
        throw new Error(`invalid goal_type for goal ${goal.id}`);
      }
      return {
        id: goal.id,
        userId: goal.user_id,
        title: goal.title,
        goalType: goal.goal_type,
        lifeArea: goal.life_area,
        metricType: goal.metric_type,
        status: goal.status,
        dueAt: goal.due_at ?? null,
        completedAt: goal.completed_at ?? null,
        createdAt: goal.created_at
      };
    }
  );
  state.activities = (activitiesResult.data ?? []).map(
    (activity): Activity => ({
      id: activity.id,
      userId: activity.user_id,
      goalId: activity.goal_id,
      taskId: activity.task_id ?? null,
      sourceMessageId: activity.source_message_id ?? null,
      summary: activity.summary,
      metricType: activity.metric_type,
      value: Number(activity.value),
      unit: activity.unit,
      occurredOn: activity.occurred_on,
      createdAt: activity.created_at
    })
  );
  state.tasks = (tasksResult.data ?? []).map(
    (task): Task => ({
      id: task.id,
      userId: task.user_id,
      goalId: task.goal_id ?? null,
      sourceMessageId: task.source_message_id ?? null,
      title: task.title,
      status: task.status,
      dueAt: task.due_at ?? null,
      priority: task.priority,
      plannedMetricType: task.planned_metric_type ?? null,
      plannedValue:
        task.planned_value === null || task.planned_value === undefined
          ? null
          : Number(task.planned_value),
      plannedUnit: task.planned_unit ?? null,
      createdAt: task.created_at,
      completedAt: task.completed_at ?? null
    })
  );
  state.achievements = (achievementsResult.data ?? []).map(
    (achievement): Achievement => ({
      id: achievement.id,
      userId: achievement.user_id,
      shortGoalId: achievement.short_goal_id ?? null,
      title: achievement.title,
      metricType: achievement.metric_type,
      thresholdValue:
        achievement.threshold_value === null ||
        achievement.threshold_value === undefined
          ? null
          : Number(achievement.threshold_value),
      note: achievement.note ?? null,
      evidenceUrl: achievement.evidence_url ?? null,
      achievedAt: achievement.achieved_at,
      createdAt: achievement.created_at
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

export async function readDashboardData(userId: string, asOf: Date = new Date()) {
  const state = await readSupabaseState(userId, asOf);
  if (state) {
    return buildDashboardData(state, userId, asOf);
  }
  return buildDashboardData(lifeOSStore.getState(), userId, asOf);
}

export async function readGoalDetail(
  goalId: string,
  userId: string,
  asOf: Date = new Date()
) {
  const state = await readSupabaseState(userId, asOf);
  if (state) {
    return buildGoalDetail(state, userId, goalId, asOf);
  }
  return buildGoalDetail(lifeOSStore.getState(), userId, goalId, asOf);
}
