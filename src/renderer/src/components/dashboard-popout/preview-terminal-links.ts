import type { IBufferRange, IDisposable, ILinkHandler, Terminal } from '@xterm/xterm'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { installGuardedLinkProviderRegistration } from '@/lib/pane-manager/terminal-link-provider-guard'
import {
  createFilePathLinkProvider,
  getTerminalFileOpenHint,
  openFilePathLinkAtBufferPosition,
  type LinkHandlerDeps
} from '@/components/terminal-pane/terminal-link-handlers'
import { openHttpLinkAtBufferPosition } from '@/components/terminal-pane/terminal-url-link-hit-testing'
import { getTerminalBufferPositionForMouseEvent } from '@/components/terminal-pane/terminal-mouse-buffer-position'
import type { TerminalPathExistsCache } from '@/components/terminal-pane/terminal-path-exists-cache'
import { TERMINAL_HTTP_URL_REGEX } from '../../../../shared/terminal/links/terminal-http-url-extraction'
import type { DashboardCardTerminalLinks } from '../../../../shared/dashboard-snapshot'
import {
  dashboardPreviewHttpActions,
  type DashboardPreviewLinkSource
} from './dashboard-preview-http-actions'

export type PreviewTerminalLinkHandler = Omit<ILinkHandler, 'activate' | 'leave'> & {
  activate(event: MouseEvent, uri: string, range?: IBufferRange): void
  leave?(event: MouseEvent, uri: string, range?: IBufferRange): void
}

export type PreviewTerminalLinkHandlers =
  | PreviewTerminalLinkHandler
  | ((defaults: PreviewTerminalLinkHandler) => PreviewTerminalLinkHandler)

type PreviewTerminalLinksDeps = {
  getTerminalLinks: () => DashboardCardTerminalLinks | null | undefined
  /** When present, HTTP link clicks route through smart browser-tab foregrounding instead of always opening a new system-browser window. */
  getLinkSource?: () => DashboardPreviewLinkSource | null | undefined
  onBrowserForeground?: () => void
  /** Overrides the default activate/hover/leave triple, e.g. for the LinkActionPopover hover UI. */
  linkHandlers?: PreviewTerminalLinkHandlers
}

function isPreviewLinkActivation(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.altKey
}

function previewLinkDeps(
  terminal: Terminal,
  links: DashboardCardTerminalLinks,
  pathExistsCache: TerminalPathExistsCache
): LinkHandlerDeps {
  return {
    worktreeId: links.worktreeId,
    worktreePath: links.worktreePath,
    startupCwd: links.startupCwd,
    getPaneLinkCwd: () => links.startupCwd,
    terminalHomePath: links.terminalHomePath ?? null,
    wslDistro: links.wslDistro ?? null,
    runtimeEnvironmentId: links.runtimeEnvironmentId ?? null,
    managerRef: {
      current: {
        getPanes: () => [{ id: 1, terminal }]
      }
    } as LinkHandlerDeps['managerRef'],
    linkProviderDisposablesRef: { current: new Map<number, IDisposable>() },
    pathExistsCache,
    getRuntimeEnvironmentIdForPane: () => links.runtimeEnvironmentId ?? null,
    getLinkActionContext: () => null
  }
}

function installPreviewDirectLinkClickFallback(
  terminal: Terminal,
  deps: LinkHandlerDeps,
  links: DashboardCardTerminalLinks
): IDisposable {
  const handleMouseUp = (event: MouseEvent): void => {
    if (!isPreviewLinkActivation(event)) {
      return
    }
    const position = getTerminalBufferPositionForMouseEvent(terminal, event)
    if (!position) {
      return
    }
    const openedUrl = openHttpLinkAtBufferPosition(
      terminal.buffer.active,
      position,
      terminal.cols,
      {
        worktreeId: links.worktreeId,
        sourceOwner: links.runtimeEnvironmentId
          ? { kind: 'runtime', runtimeEnvironmentId: links.runtimeEnvironmentId }
          : { kind: 'local' },
        forceDestination: 'system'
      }
    )
    const openedFile =
      !openedUrl &&
      openFilePathLinkAtBufferPosition(terminal.buffer.active, position, terminal.cols, {
        startupCwd: links.startupCwd,
        terminalHomePath: links.terminalHomePath,
        worktreeId: links.worktreeId,
        worktreePath: links.worktreePath,
        runtimeEnvironmentId: links.runtimeEnvironmentId,
        wslDistro: links.wslDistro,
        pathExistsCache: deps.pathExistsCache,
        openWithSystemDefault: Boolean(event.shiftKey)
      })
    if (openedUrl || openedFile) {
      event.preventDefault()
      event.stopPropagation()
      terminal.clearSelection()
    }
  }
  terminal.element?.addEventListener('mouseup', handleMouseUp, { capture: true })
  return {
    dispose: () =>
      terminal.element?.removeEventListener('mouseup', handleMouseUp, { capture: true })
  }
}

/**
 * Makes URL and file links in the preview clickable. Pop-out windows do not
 * host the terminal action popover, so direct link clicks open immediately.
 */
export function installPreviewTerminalLinks(
  terminal: Terminal,
  deps?: PreviewTerminalLinksDeps
): () => void {
  // Why: a link provider throwing inside provideLinks (xterm's LinkComputer
  // raises RangeError on pathological wrapped lines) escapes to window.onerror
  // and kills the renderer — guard before any provider registers.
  installGuardedLinkProviderRegistration(terminal)
  const disposables: IDisposable[] = []
  const pathExistsCache: TerminalPathExistsCache = new Map()
  const linkTooltip = document.createElement('div')
  linkTooltip.className = 'pane-link-tooltip xterm-hover'
  linkTooltip.style.display = 'none'
  terminal.element?.parentElement?.appendChild(linkTooltip)

  const withLinks = <T>(callback: (links: DashboardCardTerminalLinks) => T): T | undefined => {
    const links = deps?.getTerminalLinks()
    if (!links) {
      return undefined
    }
    return callback(links)
  }

  const activate = (event: MouseEvent, uri: string): void => {
    if (!isPreviewLinkActivation(event)) {
      return
    }
    event.preventDefault()
    const openedLogicalUrl = withLinks((links) => {
      const position = getTerminalBufferPositionForMouseEvent(terminal, event)
      return position
        ? openHttpLinkAtBufferPosition(terminal.buffer.active, position, terminal.cols, {
            worktreeId: links.worktreeId,
            sourceOwner: links.runtimeEnvironmentId
              ? { kind: 'runtime', runtimeEnvironmentId: links.runtimeEnvironmentId }
              : { kind: 'local' },
            forceDestination: 'system'
          })
        : false
    })
    if (!openedLogicalUrl) {
      const source = deps?.getLinkSource?.()
      const smartActions = source
        ? dashboardPreviewHttpActions(source, uri, deps?.onBrowserForeground)
        : null
      if (smartActions) {
        smartActions.open(undefined)
      } else {
        void window.api.shell.openUrl(uri).catch(() => undefined)
      }
    }
    terminal.clearSelection()
  }
  // Why: the preview has no pane tooltip; the native title still shows the destination before a click.
  const hover = (_event: MouseEvent, uri: string): void => {
    terminal.element?.setAttribute('title', uri)
  }
  const leave = (): void => {
    terminal.element?.removeAttribute('title')
  }
  const resolvedHandlers =
    typeof deps?.linkHandlers === 'function'
      ? deps.linkHandlers({ activate, hover, leave })
      : deps?.linkHandlers
  terminal.loadAddon(
    new WebLinksAddon(resolvedHandlers?.activate ?? activate, {
      hover: resolvedHandlers?.hover ?? hover,
      leave: resolvedHandlers?.leave ?? leave,
      urlRegex: TERMINAL_HTTP_URL_REGEX
    })
  )
  // Why: without a linkHandler xterm's OSC 8 default confirm()s and window.open()s, which Electron blocks (#34229).
  // Guarded: some hosts (older xterm builds, test harnesses) construct a Terminal whose `options`
  // isn't ready synchronously after open() — skipping the assignment there just keeps the old
  // (Electron-blocked) OSC 8 default instead of crashing terminal setup.
  if (terminal.options) {
    terminal.options.linkHandler = resolvedHandlers ?? { activate, hover, leave }
  }
  const links = deps?.getTerminalLinks()
  if (links) {
    const linkDeps = previewLinkDeps(terminal, links, pathExistsCache)
    disposables.push(
      terminal.registerLinkProvider(
        createFilePathLinkProvider(1, linkDeps, linkTooltip, getTerminalFileOpenHint(false))
      ),
      installPreviewDirectLinkClickFallback(terminal, linkDeps, links)
    )
  }
  return () => {
    for (const disposable of disposables) {
      disposable.dispose()
    }
    linkTooltip.remove()
  }
}
