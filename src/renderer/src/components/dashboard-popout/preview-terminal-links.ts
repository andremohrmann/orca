import type { IDisposable, Terminal } from '@xterm/xterm'
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
import type { DashboardCardTerminalLinks } from '../../../../shared/dashboard-snapshot'

type PreviewTerminalLinksDeps = {
  getTerminalLinks: () => DashboardCardTerminalLinks | null | undefined
}

function isPreviewLinkActivation(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.altKey
}

function previewLinkDeps(
  terminal: Terminal,
  links: DashboardCardTerminalLinks,
  pathExistsCache: Map<string, boolean>
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
  const pathExistsCache = new Map<string, boolean>()
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

  terminal.loadAddon(
    new WebLinksAddon((event, uri) => {
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
        void window.api.shell.openUrl(uri).catch(() => undefined)
      }
      terminal.clearSelection()
    })
  )
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
