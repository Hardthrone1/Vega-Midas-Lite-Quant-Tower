// src/app/theme/brandRamp.ts
// Fluent v9 brand ramp anchored on the product blue (#4c8dff at shade 100).
//
// Fluent components read their accent from this ramp, not from our CSS custom
// properties — so without it, primary Buttons, focus rings, Dropdown/Radio
// selected states and "brand" Badges keep rendering Microsoft's stock #0f6cbd
// no matter what theme.css says.
import type { BrandVariants } from '@fluentui/react-components'

export const vegaBrand: BrandVariants = {
  10: '#020409',
  20: '#0b1122',
  30: '#101a33',
  40: '#152451',
  50: '#1a2f70',
  60: '#1f3a90',
  70: '#2446b1',
  80: '#2a52d3',
  90: '#345ef0',
  100: '#4c8dff',
  110: '#6a9dff',
  120: '#7dabff',
  130: '#95bcff',
  140: '#adcbff',
  150: '#c6dbff',
  160: '#e0ecff',
}
