const TARGET_TERMINAL_ASPECT_RATIO = 1.45
const DENSITY_ASPECT_RATIO = {
  auto: TARGET_TERMINAL_ASPECT_RATIO,
  compact: 1.1,
  comfortable: TARGET_TERMINAL_ASPECT_RATIO,
  large: 2
} as const

export function getAgentLiveGridColumns(
  count: number,
  width: number,
  height: number,
  density: keyof typeof DENSITY_ASPECT_RATIO = 'auto'
): number {
  if (count <= 1 || width <= 0 || height <= 0) {
    return 1
  }
  const availableAspectRatio = width / height
  const targetAspectRatio = DENSITY_ASPECT_RATIO[density]
  return Math.max(
    1,
    Math.min(count, Math.round(Math.sqrt((count * availableAspectRatio) / targetAspectRatio)))
  )
}
