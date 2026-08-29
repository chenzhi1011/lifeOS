export const HEALING_PALETTE = {
  skyTop: "#9DCDF2", skyHorizon: "#FFE0B5", sun: "#FFF1C7", fog: "#DDE8D5", futureWarmFog: "#F3DFC4",
  grass: "#91B873", grassLight: "#B8CE8F", soil: "#C99D72", trunk: "#7A554A", trunkShadow: "#724540", trunkHover: "#916F65", trunkSelected: "#A98276",
  matureLeaf: "#6FAF67", youngLeaf: "#A7D97B", dormantLeaf: "#C6A56D", fruit: ["#F29A78", "#F5C56A"],
  cloud: "#FFF8E8", uiBackground: "#FFF8EA", uiText: "#59483A"
} as const;
export const HEALING_CSS_VARS = { "--healing-sky-top": HEALING_PALETTE.skyTop, "--healing-sky-horizon": HEALING_PALETTE.skyHorizon,
  "--healing-ui-background": HEALING_PALETTE.uiBackground, "--healing-ui-text": HEALING_PALETTE.uiText } as const;

export function achievementFruitColor(achievementId: string): (typeof HEALING_PALETTE.fruit)[number] {
  let hash = 0;
  for (const character of achievementId) hash = Math.imul(31, hash) + character.charCodeAt(0) | 0;
  return HEALING_PALETTE.fruit[(hash >>> 0) % 2]!;
}
