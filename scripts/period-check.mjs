// Throwaway diagnostic — do NOT commit.
// Calls Stormglass /weather/point for Harlyn and prints swell vs secondary-swell
// vs total-wave period per hour, to eyeball which period the feed reports.
//
// Uses 1 of the 10 daily Stormglass requests. Run: node scripts/period-check.mjs

import { readFileSync } from 'node:fs'

const BASE = 'https://api.stormglass.io/v2'
const LAT = 50.535
const LNG = -4.999
const DAYS = 2
const PARAMS = [
  'swellHeight',
  'swellPeriod',
  'swellDirection',
  'secondarySwellHeight',
  'secondarySwellPeriod',
  'secondarySwellDirection',
  'waveHeight',
  'wavePeriod',
]

function apiKey() {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*STORMGLASS_API_KEY\s*=\s*(.*)\s*$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  throw new Error('STORMGLASS_API_KEY not found in .env.local')
}

const pick = (v) => (v && typeof v.sg === 'number' ? v.sg : null)
const f = (n, d = 1) => (n === null ? '  -  ' : n.toFixed(d))
const dir = (n) => (n === null ? ' -  ' : `${Math.round(n)}`.padStart(3) + '°')

const now = Date.now()
const url = new URL(`${BASE}/weather/point`)
url.searchParams.set('lat', String(LAT))
url.searchParams.set('lng', String(LNG))
url.searchParams.set('params', PARAMS.join(','))
url.searchParams.set('source', 'sg')
url.searchParams.set('start', new Date(now).toISOString())
url.searchParams.set('end', new Date(now + DAYS * 86_400_000).toISOString())

const res = await fetch(url, { headers: { Authorization: apiKey() } })
if (!res.ok) {
  console.error(`Stormglass ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const data = await res.json()
const hours = data.hours ?? []

console.log(
  `Harlyn (${LAT}, ${LNG}) — ${hours.length} hours\n` +
    'time (UTC)        | swell  H/P/Dir        | secondary H/P/Dir     | wave  H/P',
)
console.log('-'.repeat(86))
for (const h of hours) {
  const t = h.time.replace('T', ' ').slice(0, 16)
  const sw = `${f(pick(h.swellHeight))}m/${f(pick(h.swellPeriod))}s/${dir(pick(h.swellDirection))}`
  const sec = `${f(pick(h.secondarySwellHeight))}m/${f(pick(h.secondarySwellPeriod))}s/${dir(pick(h.secondarySwellDirection))}`
  const wv = `${f(pick(h.waveHeight))}m/${f(pick(h.wavePeriod))}s`
  console.log(`${t} | ${sw.padEnd(21)} | ${sec.padEnd(21)} | ${wv}`)
}

if (data.meta) {
  console.log(
    `\nmeta: requestCount=${data.meta.requestCount} dailyQuota=${data.meta.dailyQuota}`,
  )
}
