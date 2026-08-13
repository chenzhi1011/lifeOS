export const LIFE_AREA_IDS = [
  "work",
  "growth",
  "health",
  "life",
  "finance",
  "relationships",
  "entertainment"
] as const;

export type LifeAreaId = (typeof LIFE_AREA_IDS)[number];

export const LIFE_AREAS = [
  { id: "work", label: "工作", slot: 0 },
  { id: "growth", label: "成长", slot: 1 },
  { id: "health", label: "健康", slot: 2 },
  { id: "life", label: "生活", slot: 3 },
  { id: "finance", label: "财务", slot: 4 },
  { id: "relationships", label: "人际关系", slot: 5 },
  { id: "entertainment", label: "娱乐", slot: 6 }
] as const satisfies readonly {
  id: LifeAreaId;
  label: string;
  slot: number;
}[];

export function isLifeAreaId(value: unknown): value is LifeAreaId {
  return typeof value === "string" && LIFE_AREA_IDS.includes(value as LifeAreaId);
}
