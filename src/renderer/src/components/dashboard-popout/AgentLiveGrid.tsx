import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import type { DashboardCard, DashboardFilterOption } from '../../../../shared/dashboard-snapshot'
import type { WorkspaceStatus } from '../../../../shared/worktree/types'
import { AgentTerminalPreview } from './AgentTerminalPreview'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { getAgentLiveGridColumns } from './agent-live-grid-layout'
import {
  mergeLiveOrder,
  moveLiveCardBefore,
  orderedPaneKeys,
  sortedLiveCards
} from './agent-live-grid-order'
import type { AgentRevealArgs } from './AgentTerminalDialog'
import { useAgentLiveGridLayout } from './useAgentLiveGridLayout'
import type { AgentDashboardLiveSort } from '../../../../shared/agent-dashboard-live-layout'
import { AgentLiveCompactPaneRow } from './AgentLiveCompactPaneRow'
import { AgentLiveGridHeader } from './AgentLiveGridHeader'
import { AgentLiveGridToolbar } from './AgentLiveGridToolbar'
import { inactiveLivePaneKeys } from './agent-live-grid-auto-minimize'
import type { RepoIcon } from '../../../../shared/repo-icon'

type AgentLiveGridProps = {
  cards: DashboardCard[]
  repoIconsByRepoId?: Record<string, RepoIcon | null>
  onOpenTerminal: (card: DashboardCard) => void
  onRevealAgent: (args: AgentRevealArgs) => void
  onAssignWorkspaceStatus: (worktreeId: string, status: WorkspaceStatus) => void
  onRenameWorkspace: (worktreeId: string, displayName: string) => void
  statusOptions?: readonly DashboardFilterOption[]
}

type LiveDashboardCard = DashboardCard & { ptyId: string }

const LIVE_GRID_PANE_MIME = 'application/x-orca-live-pane-key'

function getInitialContainerSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 }
  }
  return { width: window.innerWidth, height: window.innerHeight }
}

export function AgentLiveGrid({
  cards,
  repoIconsByRepoId,
  onOpenTerminal,
  onRevealAgent,
  onAssignWorkspaceStatus,
  onRenameWorkspace,
  statusOptions
}: AgentLiveGridProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef(new Map<string, HTMLElement>())
  const draggedPaneKeyRef = useRef<string | null>(null)
  const cancelRenameRef = useRef(false)
  const restoredAtByPaneKeyRef = useRef(new Map<string, number>())
  const autoMinimizeStateRef = useRef<{
    visibleOrderedCards: DashboardCard[]
    minimizedPaneKeys: Set<string>
    hiddenPaneKeys: Set<string>
    afterMinutes: number
  }>({
    visibleOrderedCards: [],
    minimizedPaneKeys: new Set(),
    hiddenPaneKeys: new Set(),
    afterMinutes: 0
  })
  const [layout, saveLayout] = useAgentLiveGridLayout()
  const [containerSize, setContainerSize] = useState(getInitialContainerSize)
  const [editingPaneKey, setEditingPaneKey] = useState<string | null>(null)
  const [focusedPaneKey, setFocusedPaneKey] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const updateSize = (): void => {
      const width = container.clientWidth || window.innerWidth
      const height = container.clientHeight || window.innerHeight
      setContainerSize({ width, height })
    }
    if (typeof ResizeObserver === 'undefined') {
      updateSize()
      return
    }
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    updateSize()
    return () => observer.disconnect()
  }, [])

  const hiddenPaneKeys = useMemo(() => new Set(layout.hidden ?? []), [layout.hidden])
  const minimizedPaneKeys = useMemo(() => new Set(layout.minimized ?? []), [layout.minimized])
  const density = layout.density ?? 'auto'
  const orderedCards = useMemo(() => mergeLiveOrder(cards, layout), [cards, layout])
  const visibleOrderedCards = useMemo(
    () => orderedCards.filter((card) => !hiddenPaneKeys.has(card.paneKey)),
    [hiddenPaneKeys, orderedCards]
  )
  const visibleCards = useMemo(
    () =>
      visibleOrderedCards.filter(
        (card) => !minimizedPaneKeys.has(card.paneKey) && (!layout.hideClosed || card.ptyId)
      ),
    [layout.hideClosed, minimizedPaneKeys, visibleOrderedCards]
  )
  const liveCards = visibleCards.filter((card): card is LiveDashboardCard => Boolean(card.ptyId))
  const closedCards = visibleCards.filter((card) => !card.ptyId)
  const minimizedCards = visibleOrderedCards.filter((card) => minimizedPaneKeys.has(card.paneKey))
  const autoMinimizeAfterMinutes = layout.autoMinimizeAfterMinutes ?? 0
  const columns = useMemo(
    () =>
      getAgentLiveGridColumns(liveCards.length, containerSize.width, containerSize.height, density),
    [containerSize.height, containerSize.width, density, liveCards.length]
  )
  const rows = Math.max(1, Math.ceil(liveCards.length / columns))

  useEffect(() => {
    if (focusedPaneKey && !visibleCards.some((card) => card.paneKey === focusedPaneKey)) {
      setFocusedPaneKey(visibleCards[0]?.paneKey ?? null)
    }
  }, [focusedPaneKey, visibleCards])

  useEffect(() => {
    autoMinimizeStateRef.current = {
      visibleOrderedCards,
      minimizedPaneKeys,
      hiddenPaneKeys,
      afterMinutes: autoMinimizeAfterMinutes
    }
  }, [autoMinimizeAfterMinutes, hiddenPaneKeys, minimizedPaneKeys, visibleOrderedCards])

  useEffect(() => {
    const minimizeInactivePanes = (): void => {
      const current = autoMinimizeStateRef.current
      if (current.afterMinutes <= 0) {
        return
      }
      const nextPaneKeys = inactiveLivePaneKeys({
        cards: current.visibleOrderedCards,
        minimizedPaneKeys: current.minimizedPaneKeys,
        hiddenPaneKeys: current.hiddenPaneKeys,
        restoredAtByPaneKey: restoredAtByPaneKeyRef.current,
        now: Date.now(),
        afterMinutes: current.afterMinutes
      })
      if (nextPaneKeys.length === 0) {
        return
      }
      saveLayout((current) => {
        const next = new Set(current.minimized ?? [])
        for (const paneKey of nextPaneKeys) {
          next.add(paneKey)
        }
        return { ...current, minimized: [...next] }
      })
    }
    const interval = window.setInterval(minimizeInactivePanes, 30_000)
    return () => window.clearInterval(interval)
  }, [saveLayout])

  const windowTitle = (card: DashboardCard): string =>
    layout.names?.[card.paneKey] ||
    card.worktreeName ||
    card.repoName ||
    card.conversationName ||
    formatAgentTypeLabel(card.agentType)
  const windowSubtitle = (card: DashboardCard): string =>
    card.conversationName || formatAgentTypeLabel(card.agentType)

  const persistOrder = (nextCards: DashboardCard[]): void => {
    saveLayout((current) => ({
      ...current,
      order: orderedPaneKeys(nextCards),
      sort: 'manual'
    }))
  }
  const moveCard = (targetPaneKey: string, event?: DragEvent): void => {
    const transferredPaneKey = event?.dataTransfer.getData(LIVE_GRID_PANE_MIME)
    const sourcePaneKey = transferredPaneKey || draggedPaneKeyRef.current
    if (!sourcePaneKey || sourcePaneKey === targetPaneKey) {
      return
    }
    const next = moveLiveCardBefore(orderedCards, sourcePaneKey, targetPaneKey)
    if (next === orderedCards) {
      return
    }
    draggedPaneKeyRef.current = null
    persistOrder(next)
  }
  const beginRename = (card: DashboardCard): void => {
    cancelRenameRef.current = false
    setNameDraft(windowTitle(card))
    setEditingPaneKey(card.paneKey)
  }
  const finishRename = (): void => {
    if (!editingPaneKey) {
      return
    }
    const name = nameDraft.trim().slice(0, 128)
    const card = cards.find((item) => item.paneKey === editingPaneKey)
    const canceled = cancelRenameRef.current
    saveLayout((current) => ({
      ...current,
      names: canceled || !name ? current.names : { ...current.names, [editingPaneKey]: name }
    }))
    if (!canceled && name && card) {
      onRenameWorkspace(card.worktreeId, name)
    }
    cancelRenameRef.current = false
    setEditingPaneKey(null)
  }
  const toggleSetValue = (key: 'minimized' | 'hidden', paneKey: string, present: boolean): void => {
    if (key === 'minimized' && !present) {
      restoredAtByPaneKeyRef.current.set(paneKey, Date.now())
    }
    saveLayout((current) => {
      const next = new Set(current[key] ?? [])
      if (present) {
        next.add(paneKey)
      } else {
        next.delete(paneKey)
      }
      return { ...current, [key]: [...next] }
    })
  }
  const applySort = (sort: AgentDashboardLiveSort): void => {
    const nextCards = sortedLiveCards(cards, sort)
    saveLayout((current) => ({ ...current, sort, order: orderedPaneKeys(nextCards) }))
  }
  const focusByOffset = (offset: number): void => {
    if (visibleCards.length === 0) {
      return
    }
    const currentIndex = Math.max(
      0,
      visibleCards.findIndex((card) => card.paneKey === focusedPaneKey)
    )
    const next = visibleCards[(currentIndex + offset + visibleCards.length) % visibleCards.length]
    setFocusedPaneKey(next.paneKey)
    tileRefs.current.get(next.paneKey)?.focus()
  }

  if (cards.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        {translate('dashboardPopout.live.empty', 'No matching terminals or chats.')}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-1.5"
      onKeyDown={(event) => {
        if (event.target instanceof Element && event.target.closest('input, textarea')) {
          return
        }
        if (!(event.ctrlKey && event.altKey)) {
          return
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault()
          focusByOffset(1)
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault()
          focusByOffset(-1)
        } else if (event.key === 'Enter' && focusedPaneKey) {
          const card = cards.find((item) => item.paneKey === focusedPaneKey)
          if (card) {
            event.preventDefault()
            onRevealAgent({
              repoId: card.repoId,
              worktreeId: card.worktreeId,
              executionHostId: card.executionHostId,
              tabId: card.tabId,
              leafId: card.leafId
            })
          }
        }
      }}
    >
      <AgentLiveGridToolbar
        layout={layout}
        density={density}
        hiddenCount={layout.hidden?.length ?? 0}
        onReset={() => saveLayout(() => ({ density: 'auto', sort: 'manual', hideClosed: false }))}
        onShowHidden={() => saveLayout((current) => ({ ...current, hidden: [] }))}
        onApplySort={applySort}
        onSetDensity={(nextDensity) =>
          saveLayout((current) => ({ ...current, density: nextDensity }))
        }
        onToggleClosed={() =>
          saveLayout((current) => ({ ...current, hideClosed: !current.hideClosed }))
        }
      />
      {liveCards.length > 0 ? (
        <div
          className="grid min-h-0 flex-1 gap-px bg-border"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
          }}
        >
          {liveCards.map((card) => (
            <section
              key={card.paneKey}
              ref={(element) => {
                if (element) {
                  tileRefs.current.set(card.paneKey, element)
                } else {
                  tileRefs.current.delete(card.paneKey)
                }
              }}
              tabIndex={-1}
              className={cn(
                'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-card outline-none',
                focusedPaneKey === card.paneKey
                  ? 'border-ring ring-[2px] ring-ring/35'
                  : card.bucket === 'attention'
                    ? 'border-amber-500/60'
                    : 'border-border'
              )}
              onPointerDown={() => setFocusedPaneKey(card.paneKey)}
              onFocus={() => setFocusedPaneKey(card.paneKey)}
              onDragOver={(event) => {
                const isLiveGridDrag =
                  draggedPaneKeyRef.current ||
                  event.dataTransfer.types.includes(LIVE_GRID_PANE_MIME)
                if (isLiveGridDrag) {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                moveCard(card.paneKey, event)
              }}
            >
              {card.bucket === 'attention' ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-amber-500/70" />
              ) : null}
              <AgentLiveGridHeader
                card={card}
                title={windowTitle(card)}
                subtitle={windowSubtitle(card)}
                repoIcon={repoIconsByRepoId?.[card.repoId]}
                editingPaneKey={editingPaneKey}
                nameDraft={nameDraft}
                setNameDraft={setNameDraft}
                beginRename={beginRename}
                finishRename={finishRename}
                cancelRenameRef={cancelRenameRef}
                onDragStart={(event) => {
                  draggedPaneKeyRef.current = card.paneKey
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData(LIVE_GRID_PANE_MIME, card.paneKey)
                }}
                onDragEnd={() => {
                  draggedPaneKeyRef.current = null
                }}
                onOpenTerminal={onOpenTerminal}
                onRevealAgent={onRevealAgent}
                onAssignWorkspaceStatus={onAssignWorkspaceStatus}
                statusOptions={statusOptions}
                onMinimize={() => toggleSetValue('minimized', card.paneKey, true)}
                onClose={() => toggleSetValue('hidden', card.paneKey, true)}
              />
              <AgentTerminalPreview
                ptyId={card.ptyId}
                terminalInput={card.terminalInput ?? null}
                terminalLinks={card.terminalLinks ?? null}
                claimGrid={true}
                refreshAfterInput={false}
                scaleToFit={false}
                autoFocus={false}
                onClosedActivate={() =>
                  onRevealAgent({
                    repoId: card.repoId,
                    worktreeId: card.worktreeId,
                    executionHostId: card.executionHostId,
                    tabId: card.tabId,
                    leafId: card.leafId
                  })
                }
                className="h-full min-h-0 min-w-0 max-w-full flex-1 overflow-hidden [contain:paint]"
              />
            </section>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {translate('dashboardPopout.live.noLiveTerminals', 'No live terminals.')}
        </div>
      )}
      <AgentLiveCompactPaneRow
        cards={closedCards}
        label={translate('dashboardPopout.live.closedPanes', 'Closed panes')}
        titleForCard={windowTitle}
        onRevealAgent={onRevealAgent}
        onClose={(card) => toggleSetValue('hidden', card.paneKey, true)}
      />
      <AgentLiveCompactPaneRow
        cards={minimizedCards}
        label={translate('dashboardPopout.live.minimizedPanes', 'Minimized')}
        titleForCard={windowTitle}
        onRevealAgent={(card) => toggleSetValue('minimized', card.paneKey, false)}
        onClose={(card) => toggleSetValue('hidden', card.paneKey, true)}
      />
    </div>
  )
}
