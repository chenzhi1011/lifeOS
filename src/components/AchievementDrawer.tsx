"use client";

import { useEffect, useRef } from "react";
import type { Achievement } from "@/src/domain/types";

type AchievementDrawerProps = {
  achievements: Achievement[];
  onClose: () => void;
};

function achievedTime(achievement: Achievement): number {
  const value = Date.parse(achievement.achievedAt);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

export function AchievementDrawer({
  achievements,
  onClose
}: AchievementDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const orderedAchievements = [...achievements].sort(
    (left, right) =>
      achievedTime(right) - achievedTime(left) || left.id.localeCompare(right.id)
  );

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#15351d]/24 backdrop-blur-[2px]">
      <button
        aria-label="关闭果实面板"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="achievement-drawer-title"
        aria-modal="true"
        className="relative z-10 h-full w-full overflow-y-auto border-l border-[#315d3a]/20 bg-[#f8f7ed]/95 p-5 text-[#18321e] shadow-2xl sm:max-w-md sm:p-7"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[#55705a]">过去的收获</p>
            <h2 className="mt-2 text-2xl font-semibold" id="achievement-drawer-title">
              果实面板
            </h2>
          </div>
          <button
            aria-label="关闭果实面板"
            className="rounded-full border border-[#315d3a]/25 bg-white/75 px-3 py-1.5 text-sm font-semibold text-[#18321e] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f7e58]"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            关闭
          </button>
        </div>

        {orderedAchievements.length === 0 ? (
          <p className="mt-8 rounded-xl border border-[#315d3a]/15 bg-white/65 p-4 text-sm text-[#47604c]">
            还没有收获。完成短期目标后，果实会保存在这里。
          </p>
        ) : (
          <ol className="mt-7 space-y-4">
            {orderedAchievements.map((achievement) => (
              <li
                className="rounded-2xl border border-[#315d3a]/15 bg-white/72 p-4 shadow-sm"
                key={achievement.id}
              >
                <p className="text-xs font-medium text-[#637467]">
                  {achievement.achievedAt.slice(0, 10)}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[#18321e]" data-testid="achievement-title">
                  {achievement.title}
                </h3>
                <p className="mt-1 text-xs text-[#6b7c6e]">
                  原短期目标：{achievement.shortGoalId ?? "未关联"}
                </p>
                {achievement.note ? (
                  <p className="mt-3 text-sm leading-6 text-[#334d39]">{achievement.note}</p>
                ) : null}
                {achievement.evidenceUrl ? (
                  <a
                    className="mt-3 inline-flex text-sm font-semibold text-[#28633a] underline decoration-[#28633a]/35 underline-offset-4"
                    href={achievement.evidenceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    查看成果证据
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
