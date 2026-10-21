import { Clipboard, Copy, TextSelect } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { formatPrimaryShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import type { KeybindingOverrides } from '../../../../shared/keybindings'

export function PreviewTerminalContextMenu({
  open,
  onOpenChange,
  point,
  keybindings,
  onCopy,
  onSelectAll,
  onPaste
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  point: { x: number; y: number }
  keybindings: KeybindingOverrides
  onCopy: () => void
  onSelectAll: () => void
  onPaste: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute size-px opacity-0"
          style={{ left: point.x, top: point.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-44"
        sideOffset={0}
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
      >
        <DropdownMenuItem onSelect={onCopy}>
          <Copy />
          {translate('auto.components.terminal.pane.TerminalContextMenu.f3eeb1de13', 'Copy')}
          <DropdownMenuShortcut>
            {formatPrimaryShortcutLabel('terminal.copySelection', keybindings)}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSelectAll}>
          <TextSelect />
          {translate('auto.components.terminal.pane.TerminalContextMenu.selectAll', 'Select All')}
          <DropdownMenuShortcut>
            {formatPrimaryShortcutLabel('terminal.selectAll', keybindings)}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onPaste}>
          <Clipboard />
          {translate('auto.components.terminal.pane.TerminalContextMenu.0a917b591a', 'Paste')}
          <DropdownMenuShortcut>
            {formatPrimaryShortcutLabel('terminal.paste', keybindings)}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
