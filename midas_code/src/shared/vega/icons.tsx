import {
  BarChart3,
  FlaskConical,
  Hexagon,
  Inbox,
  RefreshCw,
  Rocket,
  ScrollText,
  Stethoscope,
  StickyNote,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** Map icons to the 7 main navigation tabs (by step number) */
export const mainIconMap: Record<string, LucideIcon> = {
  '01': Inbox,
  '02': StickyNote,
  '03': RefreshCw,
  '04': Hexagon,
  '05': Stethoscope,
  '06': BarChart3,
  '07': Rocket,
}

/** Map icons to execution mode segmented controls */
export const executionIconMap: Record<string, LucideIcon> = {
  research: FlaskConical,
  paper: ScrollText,
  'live-ready': Zap,
}

export function VegaIcon({
  icon: Icon,
  className = 'tab-icon',
  size = 15,
}: {
  icon: LucideIcon
  className?: string
  size?: number
}) {
  return <Icon size={size} className={className} aria-hidden strokeWidth={1.75} />
}