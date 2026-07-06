import * as Popover from '@radix-ui/react-popover'
import type { ReactNode } from 'react'
import { Portal } from './Portal'

interface AnimatedPopoverProps {
  trigger: ReactNode
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  alignOffset?: number
  showArrow?: boolean
  modal?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  contentClassName?: string
}

export function AnimatedPopover({
  trigger,
  content,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  alignOffset = 0,
  showArrow = true,
  modal = false,
  open,
  onOpenChange,
  className = '',
  contentClassName = '',
}: AnimatedPopoverProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Popover.Trigger asChild>
        <div className={className}>{trigger}</div>
      </Popover.Trigger>

      <Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          className={`animated-popover-content${contentClassName ? ` ${contentClassName}` : ''}`}
        >
          {content}
          {showArrow && <Popover.Arrow className="animated-popover-arrow" />}
        </Popover.Content>
      </Portal>
    </Popover.Root>
  )
}