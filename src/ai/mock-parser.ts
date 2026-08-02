import type { LifeEventParseResult } from "@/src/domain/types";

function todayDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function tomorrowIso(timestamp: string, hour = 15): string {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function parseWithMockRules(text: string, timestamp: string): LifeEventParseResult {
  const normalized = text.trim();
  const minutes = normalized.match(/(\d+)\s*分钟/);

  if (/下周\s*Sansan/i.test(normalized)) {
    return {
      type: "inbox",
      confidence: 0.48,
      rawText: normalized,
      suggestedTypes: ["task", "goal"],
      reason: "可能是面试准备任务，也可能属于转职目标。"
    };
  }

  if (/^(买水|买菜|倒垃圾|打扫卫生)$/.test(normalized)) {
    return {
      type: "task",
      path: "one_off",
      confidence: 0.96,
      rawText: normalized,
      task: { title: normalized }
    };
  }

  if (/想.*(AWS|Rust|AI|大模型|DevOps)/i.test(normalized) || /今年.*考.*AWS/i.test(normalized)) {
    const title = /Rust/i.test(normalized) ? "Rust" : /AI|大模型/i.test(normalized) ? "AI" : "AWS DevOps";
    return {
      type: "goal",
      confidence: 0.88,
      goal: {
        title,
        category: "职业",
        goalType: "long_term",
        ability: { title: "前端能力" },
        metricType: "duration",
        aliases: title === "AWS DevOps" ? ["AWS", "DevOps", "Terraform"] : [title]
      }
    };
  }

  if (/提醒/.test(normalized)) {
    return {
      type: "reminder",
      confidence: 0.86,
      goal: { title: "增肌", category: "健康" },
      task: { title: normalized.includes("练肩") ? "练肩" : normalized.replace(/提醒我/, "") },
      reminder: {
        remindAt: tomorrowIso(timestamp, 20),
        repeatRule: "none"
      }
    };
  }

  if (/明天|下周|周[一二三四五六日天]/.test(normalized) && !/今天.*(学习|完成|练|跑)/.test(normalized)) {
    const isTraining = /练肩|训练|健身/.test(normalized);
    return {
      type: "task",
      path: "goal",
      confidence: 0.9,
      goal: isTraining ? { title: "增肌", category: "健康" } : { title: "转职", category: "职业" },
      task: {
        title: isTraining ? "练肩" : normalized.replace(/^(明天|下周)/, "").trim(),
        dueAt: tomorrowIso(timestamp, isTraining ? 15 : 9),
        priority: "normal"
      }
    };
  }

  if (/今天.*(学习|完成|练|跑)/.test(normalized) || minutes) {
    const value = minutes ? Number(minutes[1]) : 1;
    const isDuration = Boolean(minutes);
    const isHealth = /练|跑|训练|健身/.test(normalized);
    const goalTitle = /Terraform|AWS|IAM|DevOps/i.test(normalized) ? "AWS" : isHealth ? "增肌" : "AI";
    return {
      type: "activity",
      confidence: 0.92,
      goal: {
        title: goalTitle,
        category: isHealth ? "健康" : "职业"
      },
      summary: normalized.replace(/^今天/, ""),
      metric: {
        type: isDuration ? "duration" : "count",
        value,
        unit: isDuration ? "minute" : "count"
      },
      date: todayDate(timestamp),
      task: null,
      reminder: null
    };
  }

  return {
    type: "inbox",
    confidence: 0.42,
    rawText: normalized,
    suggestedTypes: ["task", "activity", "goal"],
    reason: "无法可靠判断这是计划、已发生的活动，还是长期目标。"
  };
}
