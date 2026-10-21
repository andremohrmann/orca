// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { useWorktreeRuntimeTarget } from './use-worktree-runtime-target'

const initialState = useAppStore.getInitialState()

describe('useWorktreeRuntimeTarget', () => {
  afterEach(() => {
    cleanup()
    useAppStore.setState(initialState, true)
  })

  it('keeps the local target stable across unrelated store writes and parent renders', () => {
    const hook = renderHook(() => useWorktreeRuntimeTarget(null))
    const initialTarget = hook.result.current

    expect(initialTarget).toEqual({ kind: 'local' })

    act(() => {
      useAppStore.setState({
        agentStatusEpoch: useAppStore.getState().agentStatusEpoch + 1
      })
    })
    hook.rerender()

    expect(hook.result.current).toBe(initialTarget)
  })
})
