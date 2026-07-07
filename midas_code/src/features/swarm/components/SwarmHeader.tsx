import React from 'react'
import { Badge } from '../../../shared/ui'
import type { Status } from '../../../shared/ui'

export interface SwarmHeaderProps {
  breadcrumb?: string
  title: string
  gatewayStatus: 'online' | 'offline' | 'checking'
  onExpand: () => void
  isFullscreen: boolean
}

export const SwarmHeader: React.FC<SwarmHeaderProps> = ({
  breadcrumb = 'Swarm',
  title,
  gatewayStatus,
  onExpand,
  isFullscreen,
}) => {
  const gwBadgeStatus: Status = 
    gatewayStatus === 'online' ? 'ok' : 
    gatewayStatus === 'offline' ? 'err' : 
    'idle'

  return (
    <header className="swarm-header">
      {/* Left Column: Breadcrumb & Primary Title */}
      <div className="swarm-header-left">
        <span className="swarm-breadcrumb">
          {breadcrumb}
        </span>
        <h1 className="swarm-title">
          {title}
        </h1>
      </div>

      {/* Right Column: Global Status & Window Controls */}
      <div className="swarm-header-right">
        {/* Unified Gateway Status Pill */}
        <Badge 
          status={gwBadgeStatus} 
          className={gatewayStatus === 'online' ? 'status-live badge-live' : ''}
        >
          Gateway {gatewayStatus}
        </Badge>

        {/* Expand Toggle */}
        <button
          type="button"
          className="swarm-expand-btn"
          onClick={onExpand}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? '⤡' : '⤢'}
        </button>
      </div>
    </header>
  )
}
