export type LibraryRow = { id: string; kind: string; status: string; answer: string | null; due: boolean; ended: boolean; problems: number }
export type LibrarySummary = { asOf: string; proposed: number; ratified: number; due: number; rows: LibraryRow[] }

declare module 'claude-code' {
  interface PluginState {
    'governed-library': { summary: Shaped<LibrarySummary | null> }
  }
}
