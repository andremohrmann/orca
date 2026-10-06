import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { useMobileNativeChatTurnDisclosure } from './use-mobile-native-chat-turn-disclosure'

function userMessage(id: string): NativeChatMessage {
  return {
    id,
    role: 'user',
    blocks: [{ type: 'text', text: id }],
    timestamp: null,
    source: 'transcript'
  }
}

function Harness({
  messages,
  thinking,
  lineYields
}: {
  messages: readonly NativeChatMessage[]
  thinking?: boolean
  lineYields?: boolean
}): React.JSX.Element {
  const disclosure = useMobileNativeChatTurnDisclosure({
    messages,
    enabled: true,
    isWorking: true,
    thinking,
    lineYields,
    scopeKey: 'host\0worktree\0tab-a'
  })
  return createElement('result', { disclosure })
}

describe('the open reasoning block the live line discloses', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  const block = (id: string, state: 'running' | 'completed'): NativeChatMessage => ({
    id,
    role: 'reasoning',
    blocks: [{ type: 'text', text: `${id} weighs two approaches` }],
    timestamp: null,
    source: 'transcript',
    state
  })
  const show = (
    messages: NativeChatMessage[],
    props: { thinking?: boolean; lineYields?: boolean }
  ) =>
    act(() => {
      const element = createElement(Harness, { messages, ...props })
      if (renderer) {
        renderer.update(element)
      } else {
        renderer = create(element)
      }
    })
  const latest = () => renderer!.root.findByType('result').props.disclosure

  it('hides only that block, and lands it open once it ends if the reader opened it live', () => {
    const prompt = userMessage('u1')
    show([prompt, block('r-1', 'running')], { thinking: true })
    expect(latest().liveLine).toMatchObject({
      reasoning: { message: { id: 'r-1' } },
      reasoningExpanded: false
    })
    expect(latest().resolveRow(1, block('r-1', 'running')).reasoningIsLive).toBe(true)
    act(() => latest().onToggleReasoning('reasoning:r-1'))
    expect(latest().liveLine.reasoningExpanded).toBe(true)

    show([prompt, block('r-1', 'completed')], { thinking: false })
    expect(latest().liveLine).toMatchObject({ reasoning: null })
    const row = latest().resolveRow(1, block('r-1', 'completed'))
    expect(row).toMatchObject({ reasoningIsLive: false, reasoningExpanded: true })

    show([prompt, block('r-1', 'completed'), block('r-2', 'running')], { thinking: true })
    expect(latest().liveLine).toMatchObject({
      reasoning: { message: { id: 'r-2' } },
      reasoningExpanded: false
    })
  })

  it('discloses nothing, and hides nothing, while a prompt takes the line', () => {
    show([userMessage('u1'), block('r-1', 'running')], { thinking: true, lineYields: true })
    expect(latest().liveLine).toBeNull()
    expect(latest().resolveRow(1, block('r-1', 'running')).reasoningIsLive).toBe(false)
  })
})
