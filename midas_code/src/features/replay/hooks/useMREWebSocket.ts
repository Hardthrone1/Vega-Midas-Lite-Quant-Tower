// src/features/replay/hooks/useMREWebSocket.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { type ReplayBar } from './useReplayScheduler'

type MREMessage =
  | { type: 'HISTORY'; data: ReplayBar[] }
  | { type: 'BAR_DATA'; data: ReplayBar }
  | { type: 'EOF' }
  | { type: 'RESET_OK' }
  | { type: 'ERROR'; message: string }
  | { type: string; data: unknown }

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

type UseMREWebSocketOptions = {
  url?: string
  onHistory?: (bars: ReplayBar[]) => void
  onBar?: (bar: ReplayBar) => void
  onEOF?: () => void
  onReset?: () => void
  onError?: (message: string) => void
  onStatusChange?: (status: ConnectionStatus) => void
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

type UseMREWebSocketReturn = {
  status: ConnectionStatus
  sendCommand: (command: string, payload?: Record<string, unknown>) => void
  connect: () => void
  disconnect: () => void
}

export function useMREWebSocket({
  url = 'ws://127.0.0.1:8002/ws/stream',
  onHistory,
  onBar,
  onEOF,
  onReset,
  onError,
  onStatusChange,
  reconnectBaseMs = 1000,
  reconnectMaxMs = 30000,
}: UseMREWebSocketOptions = {}): UseMREWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectDelayRef = useRef(reconnectBaseMs)
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')

  const setStatusSafe = useCallback((s: ConnectionStatus) => {
    setStatus(s)
    onStatusChange?.(s)
  }, [onStatusChange])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimer()
    setStatusSafe('reconnecting')
    const delay = reconnectDelayRef.current
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null
      connect()
    }, delay)
    reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, reconnectMaxMs)
  }, [clearReconnectTimer, setStatusSafe])

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

    setStatusSafe('connecting')

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectDelayRef.current = reconnectBaseMs
      setStatusSafe('connected')
    }

    ws.onmessage = (evt) => {
      let msg: MREMessage
      try {
        msg = JSON.parse(evt.data)
      } catch {
        onError?.(`Malformed frame: ${String(evt.data).slice(0, 80)}`)
        return
      }

      switch (msg.type) {
        case 'HISTORY': {
          const hist = msg.data
          if (Array.isArray(hist) && hist.length) {
            onHistory?.(hist)
          } else {
            onError?.('HISTORY empty')
          }
          break
        }
        case 'BAR_DATA': {
          const bar = (msg as { type: 'BAR_DATA'; data: unknown }).data as Record<string, unknown>
          if (bar && typeof bar.time === 'number' && typeof bar.open === 'number' &&
              typeof bar.high === 'number' && typeof bar.low === 'number' && typeof bar.close === 'number') {
            onBar?.(bar as unknown as ReplayBar)
          } else {
            onError?.(`Invalid BAR_DATA: ${JSON.stringify(bar)}`)
          }
          break
        }
        case 'EOF':
          onEOF?.()
          break
        case 'RESET_OK':
          onReset?.()
          break
        case 'ERROR': {
          const errMsg = (msg as { type: 'ERROR'; message?: string }).message
          onError?.(errMsg || 'Unspecified server error')
          break
        }
        default:
          onError?.(`Unknown msg type: "${msg.type}"`)
      }
    }

    ws.onerror = () => {
      onError?.('WebSocket error — connection failed or interrupted')
    }

    ws.onclose = (e) => {
      if (!e.wasClean && e.code !== 1000) {
        onError?.(`Connection closed (code ${e.code})`)
      }
      setStatusSafe('disconnected')
      scheduleReconnect()
    }
  }, [url, onHistory, onBar, onEOF, onReset, onError, setStatusSafe, scheduleReconnect])

  const disconnect = useCallback(() => {
    clearReconnectTimer()
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect')
      wsRef.current = null
    }
    setStatusSafe('disconnected')
  }, [clearReconnectTimer, setStatusSafe])

  const sendCommand = useCallback((command: string, payload?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command, ...(payload ?? {}) }))
    } else {
      onError?.('Cannot send — WebSocket not connected')
    }
  }, [onError])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return { status, sendCommand, connect, disconnect }
}

// Helper to convert MRE bar format to our ReplayBar format
export function normalizeMREBar(raw: unknown): ReplayBar | null {
  const b = raw as Record<string, unknown>
  if (!b || typeof b.time !== 'number' || typeof b.open !== 'number' ||
      typeof b.high !== 'number' || typeof b.low !== 'number' || typeof b.close !== 'number') {
    return null
  }
  return {
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: typeof b.volume === 'number' ? b.volume : 0,
  }
}