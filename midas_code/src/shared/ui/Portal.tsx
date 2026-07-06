// src/shared/ui/Portal.tsx
import * as PortalPrimitive from '@radix-ui/react-portal'
import type { ReactNode } from 'react'

interface PortalProps {
  children: ReactNode
}

export function Portal({ children }: PortalProps) {
  const container =
    typeof document !== 'undefined'
      ? document.getElementById('radix-portal-root')
      : null

  return (
    <PortalPrimitive.Root container={container}>
      {children}
    </PortalPrimitive.Root>
  )
}