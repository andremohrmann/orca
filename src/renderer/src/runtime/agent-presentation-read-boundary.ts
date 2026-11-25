type Drain = () => boolean
let hookDrain: Drain | null = null
let structuredDrain: Drain | null = null
export function registerAgentPresentationDrain(
  kind: 'hook' | 'structured',
  drain: Drain
): () => void {
  if (kind === 'hook') {
    hookDrain = drain
  } else {
    structuredDrain = drain
  }
  return () => {
    if (kind === 'hook' && hookDrain === drain) {
      hookDrain = null
    }
    if (kind === 'structured' && structuredDrain === drain) {
      structuredDrain = null
    }
  }
}
export function settleAgentPresentationInputs(structured: boolean): boolean {
  return hookDrain?.() === true && (!structured || structuredDrain?.() === true)
}
