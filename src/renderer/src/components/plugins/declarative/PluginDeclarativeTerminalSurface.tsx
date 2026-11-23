import { useContext, useEffect, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { AgentTerminalPreview } from '@/components/dashboard/terminal-preview/AgentTerminalPreview'
import {
  PluginDeclarativeHostServicesContext,
  type PluginTerminalSurfaceConnection
} from './plugin-declarative-assets'

export function PluginDeclarativeTerminalSurface({
  terminalId,
  hostId,
  label,
  rows = 12
}: {
  terminalId: string
  hostId?: string
  label: string
  rows?: number
}): React.JSX.Element {
  const t = useTranslate()
  const { resolveTerminalSurface } = useContext(PluginDeclarativeHostServicesContext)
  const [profileRevision, setProfileRevision] = useState(0)
  const [connection, setConnection] = useState<{
    id: string
    value: PluginTerminalSurfaceConnection
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let resolved: PluginTerminalSurfaceConnection | null = null
    let stop: (() => void) | undefined
    setConnection(null)
    void resolveTerminalSurface?.(terminalId, controller.signal, hostId)
      .then((value) => {
        if (!value) {
          return
        }
        if (controller.signal.aborted) {
          value.dispose()
          return
        }
        resolved = value
        stop = value.onRevoked((reason) => {
          setConnection(null)
          if (reason === 'profile_changed') {
            setProfileRevision((revision) => revision + 1)
          }
        })
        setConnection({ id: `${hostId ?? ''}:${terminalId}`, value })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setConnection(null)
        }
      })
    return () => {
      controller.abort()
      stop?.()
      resolved?.dispose()
    }
  }, [terminalId, hostId, resolveTerminalSurface, profileRevision])
  const active = connection?.id === `${hostId ?? ''}:${terminalId}` ? connection.value : null
  return (
    <section
      aria-label={label}
      className="relative min-w-0 shrink-0 overflow-hidden rounded-md border border-border bg-background text-foreground"
      style={{ height: `${rows + 1}lh` }}
    >
      {active ? (
        <AgentTerminalPreview
          key={active.ptyId}
          ptyId={active.ptyId}
          terminalInput={active.terminalInput}
          api={active.api}
          passiveText
          className="h-full"
        />
      ) : (
        <div role="status" className="p-3 text-xs text-muted-foreground">
          {t('auto.plugins.terminalSurface.unavailable', 'Terminal unavailable')}
        </div>
      )}
    </section>
  )
}
