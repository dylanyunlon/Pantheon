// @ts-nocheck
/**
 * NexusDumpAll — standalone script to dump all engine state
 *
 * Usage: npx ts-node src/debug/dump-all.ts
 *
 * Dumps introspector probe state, event ring buffer contents,
 * and struct watcher diffs for all registered components.
 */

import { NexusIntrospector } from './introspector'

export function dumpAllState(): void {
  const introspector = NexusIntrospector.getInstance()

  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║         NEXUS-ENGINE — FULL STATE DUMP              ║')
  console.log('║         Generated at: ' + new Date().toISOString().padEnd(31) + '║')
  console.log('╠══════════════════════════════════════════════════════╣')

  // 1. Print full introspector report
  introspector.printReport()

  // 2. Dump all probes
  console.log('\n── Registered Probe States ──────────────────────────────')
  const probeNames = (introspector as any)._probes
  if (probeNames && probeNames instanceof Map) {
    for (const [name, fn] of probeNames) {
      console.log(`\n  [${name}]`)
      try {
        const state = fn()
        for (const [k, v] of Object.entries(state)) {
          console.log(`    ${k}: ${JSON.stringify(v)}`)
        }
      } catch (e) {
        console.log(`    <error reading probe: ${e}>`)
      }
    }
  } else {
    console.log('  (no probes registered — introspector internal structure unknown)')
  }

  // 3. Dump event buffer summary
  console.log('\n── Event Buffer Summary ─────────────────────────────────')
  const events = (introspector as any)._events
  if (events && Array.isArray(events)) {
    const typeCounts: Record<string, number> = {}
    for (const evt of events) {
      const key = `${evt.level || 'unknown'}:${evt.source || 'unknown'}`
      typeCounts[key] = (typeCounts[key] || 0) + 1
    }
    for (const [key, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key.padEnd(40)} ${count}`)
    }
    console.log(`  Total events in buffer: ${events.length}`)
  }

  // 4. Dump struct watcher diffs
  console.log('\n── Struct Watcher Diffs ─────────────────────────────────')
  const watchers = (introspector as any)._structWatchers
  if (watchers && watchers instanceof Map) {
    for (const [name, watcher] of watchers) {
      console.log(`\n  [${name}]`)
      const diffs = watcher.getDiffs ? watcher.getDiffs() : []
      if (diffs.length === 0) {
        console.log('    (no diffs recorded)')
      } else {
        for (const d of diffs.slice(-5)) {
          console.log(`    ${d.field}: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)} @${d.timestamp}`)
        }
      }
    }
  }

  console.log('\n╚══════════════════════════════════════════════════════╝')
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  dumpAllState()
}
