/**
 * Minimal, dependency-free VCALENDAR (RFC 5545) serialiser.
 *
 * Pure string work — no DB, no env. The calendar route maps scored windows into
 * `CalEvent`s and hands them here.
 */

export interface CalEvent {
  uid: string
  start: Date
  end: Date
  summary: string
  description?: string
}

const CRLF = '\r\n'

/** Format a Date as an RFC 5545 UTC timestamp: YYYYMMDDTHHMMSSZ (basic format). */
export function formatUtcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  )
}

/** Escape a TEXT value per RFC 5545 (backslash first so we don't double-escape). */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Fold a content line so no line exceeds 75 octets (RFC 5545 §3.1). Continuation
 * lines begin with a single space. Folding is octet-based and never splits a
 * UTF-8 multibyte sequence (e.g. the 🏄 in a summary).
 */
function foldLine(line: string): string {
  const bytes = encoder.encode(line)
  if (bytes.length <= 75) return line

  const chunks: string[] = []
  let i = 0
  // First line may use 75 octets; continuation lines carry a leading space, so
  // they get 74 octets of content to stay within the 75-octet limit.
  let limit = 75
  while (i < bytes.length) {
    let end = Math.min(i + limit, bytes.length)
    // Back up off any UTF-8 continuation byte (0b10xxxxxx) to land on a boundary.
    if (end < bytes.length) {
      while (end > i && (bytes[end] & 0xc0) === 0x80) end--
    }
    chunks.push(decoder.decode(bytes.subarray(i, end)))
    i = end
    limit = 74
  }
  return chunks.join(`${CRLF} `)
}

/**
 * Build a complete VCALENDAR string from a calendar name and its events.
 * Every poll regenerates this fresh from the cache; UIDs are caller-supplied and
 * stable so clients update rather than duplicate.
 */
export function buildCalendar(calName: string, events: CalEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SurfCal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ]

  const dtstamp = formatUtcStamp(new Date())

  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.uid}`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(`DTSTART:${formatUtcStamp(e.start)}`)
    lines.push(`DTEND:${formatUtcStamp(e.end)}`)
    lines.push(`SUMMARY:${escapeText(e.summary)}`)
    if (e.description !== undefined) {
      lines.push(`DESCRIPTION:${escapeText(e.description)}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return lines.map(foldLine).join(CRLF) + CRLF
}
