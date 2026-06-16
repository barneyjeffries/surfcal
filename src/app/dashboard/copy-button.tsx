'use client'

import { useState } from 'react'

/** Copies the feed URL to the clipboard, with a brief "Copied" confirmation. */
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked (e.g. insecure context); leave UI unchanged.
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="shrink-0 rounded-lg border border-black/[.12] px-3 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
