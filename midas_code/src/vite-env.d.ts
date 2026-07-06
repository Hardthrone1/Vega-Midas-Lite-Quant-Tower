/// <reference types="vite/client" />

declare module 'react-devtools-core' {
  export function connectToDevTools(options: { host: string; port: number }): void
}