import * as Slider from '@radix-ui/react-slider'
import { useState } from 'react'

interface RangeSliderProps {
  value: [number, number]
  onValueChange: (value: [number, number]) => void
  min?: number
  max?: number
  step?: number
  label?: string
  showValue?: boolean
  isInvalid?: boolean
  errorMessage?: string
  minRange?: number
  maxRange?: number
  formatValue?: (val: number) => string
  persistentTooltips?: boolean
}

export function RangeSlider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  isInvalid = false,
  errorMessage,
  minRange = 0,
  maxRange,
  formatValue = (v) => v.toString(),
  persistentTooltips = false,
}: RangeSliderProps) {
  const [minVal, maxVal] = value
  const [activeThumb, setActiveThumb] = useState<0 | 1 | null>(null)

  const currentRange = maxVal - minVal
  const isRangeInvalid =
    isInvalid ||
    minVal > maxVal ||
    (minRange > 0 && currentRange < minRange) ||
    (maxRange !== undefined && currentRange > maxRange)

  const handleValueChange = (newValue: number[]) => {
    let [newMin, newMax] = newValue as [number, number]

    if (minRange > 0 && newMax - newMin < minRange) {
      if (newMin !== minVal) newMax = Math.min(max, newMin + minRange)
      else newMin = Math.max(min, newMax - minRange)
    }

    if (maxRange !== undefined && newMax - newMin > maxRange) {
      if (newMin !== minVal) newMax = newMin + maxRange
      else newMin = newMax - maxRange
    }

    newMin = Math.max(min, Math.min(newMin, max))
    newMax = Math.max(min, Math.min(newMax, max))

    onValueChange([newMin, newMax])
  }

  const getTooltipPosition = (val: number) => {
    const percentage = ((val - min) / (max - min)) * 100
    return Math.max(0, Math.min(100, percentage))
  }

  const showMinTooltip = persistentTooltips || activeThumb === 0
  const showMaxTooltip = persistentTooltips || activeThumb === 1

  const minMarkerPos =
    minRange > 0
      ? ((minVal + minRange - min) / (max - min)) * 100
      : null

  const maxMarkerPos =
    maxRange !== undefined
      ? ((minVal + maxRange - min) / (max - min)) * 100
      : null

  return (
    <div className={`range-slider${isRangeInvalid ? ' range-slider--invalid' : ''}`}>
      {(label || showValue) && (
        <div className="range-slider-head">
          {label && <span className="range-slider-label">{label}</span>}
          {showValue && (
            <span className="range-slider-value mono">
              {formatValue(minVal)} — {formatValue(maxVal)}
            </span>
          )}
        </div>
      )}

      <div className="range-slider-body">
        <Slider.Root
          className="range-slider-root"
          value={value}
          onValueChange={handleValueChange}
          min={min}
          max={max}
          step={step}
          minStepsBetweenThumbs={Math.max(1, Math.ceil((minRange || 0) / step))}
          aria-label={label ?? 'Range slider'}
        >
          <Slider.Track className="range-slider-track">
            <Slider.Range className="range-slider-range" />
          </Slider.Track>

          {minMarkerPos !== null && (
            <div
              className="range-slider-marker"
              style={{ left: `${Math.min(minMarkerPos, 100)}%` }}
              aria-hidden
            />
          )}
          {maxMarkerPos !== null && (
            <div
              className="range-slider-marker"
              style={{ left: `${Math.min(maxMarkerPos, 100)}%` }}
              aria-hidden
            />
          )}

          <div className="range-slider-thumb-wrap">
            <Slider.Thumb
              className="range-slider-thumb"
              onPointerDown={() => setActiveThumb(0)}
              onFocus={() => setActiveThumb(0)}
              onBlur={() => setActiveThumb(null)}
              aria-label="Minimum value"
            />
            {showMinTooltip && (
              <div
                className="range-slider-tooltip"
                style={{ left: `${getTooltipPosition(minVal)}%` }}
              >
                {formatValue(minVal)}
              </div>
            )}
          </div>

          <div className="range-slider-thumb-wrap">
            <Slider.Thumb
              className="range-slider-thumb"
              onPointerDown={() => setActiveThumb(1)}
              onFocus={() => setActiveThumb(1)}
              onBlur={() => setActiveThumb(null)}
              aria-label="Maximum value"
            />
            {showMaxTooltip && (
              <div
                className="range-slider-tooltip"
                style={{ left: `${getTooltipPosition(maxVal)}%` }}
              >
                {formatValue(maxVal)}
              </div>
            )}
          </div>
        </Slider.Root>
      </div>

      {isRangeInvalid && errorMessage && (
        <p className="range-slider-error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  )
}