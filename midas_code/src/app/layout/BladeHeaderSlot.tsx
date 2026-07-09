// src/app/layout/BladeHeaderSlot.tsx
// A "teleport" slot so a feature panel can render its own controls (status
// badges, action buttons, local toggles) up into the shared blade-header's
// actions area — instead of duplicating a second in-panel header row.
//
// The Blade component (BladeHost) owns the DOM node; each panel calls
// <BladeHeaderActions> and its children are portaled into that node. This keeps
// the control logic co-located with the panel state that drives it, while the
// chrome lives once, in the blade-header.
import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const BladeHeaderSlotContext = createContext<HTMLElement | null>(null)

export function BladeHeaderSlotProvider({
  node,
  children,
}: {
  node: HTMLElement | null
  children: ReactNode
}) {
  return <BladeHeaderSlotContext.Provider value={node}>{children}</BladeHeaderSlotContext.Provider>
}

/**
 * Render this anywhere inside a blade panel; its children appear in the shared
 * blade-header's actions slot. Renders nothing until the slot node is mounted
 * (and nothing at all outside a blade, e.g. the agent-timeline drawer).
 */
export function BladeHeaderActions({ children }: { children: ReactNode }) {
  const node = useContext(BladeHeaderSlotContext)
  if (!node) return null
  return createPortal(<div className="blade-actions-group">{children}</div>, node)
}
