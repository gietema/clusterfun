/** Fixed color palette for labels — each label gets a consistent color by index. */
const LABEL_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
  "#14B8A6", // teal
];

export function getLabelColor(index: number): string {
  return LABEL_COLORS[index % LABEL_COLORS.length];
}
