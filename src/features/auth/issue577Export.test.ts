import { describe, expect, it } from 'vitest'
import { buildPortableExport } from '../../../supabase/functions/_shared/account-lifecycle'

function readStoredZipEntries(bytes: Uint8Array): Map<string, string> {
  const entries = new Map<string, string>()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  let offset = 0
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameOffset = offset + 30
    const dataOffset = nameOffset + nameLength + extraLength
    entries.set(
      decoder.decode(bytes.subarray(nameOffset, nameOffset + nameLength)),
      decoder.decode(bytes.subarray(dataOffset, dataOffset + size)),
    )
    offset = dataOffset + size
  }
  return entries
}

describe('issue #577 portable private-stop export', () => {
  it('keeps visit memories separate from store summaries and includes detached snapshots', async () => {
    const bytes = await buildPortableExport(
      JSON.stringify({
        canonical: {
          schemaVersion: 1,
          shopper: {
            memories: [
              { storeId: 'store-1', rating: 4, note: 'STORE-SUMMARY-NOTE' },
              { storeId: 'store-2', rating: 3, note: String.fromCharCode(10) + '=1+1' },
            ],
            privateStops: [
              {
                tripId: 'trip-1',
                stopId: 'stop-1',
                kind: 'private',
                label: 'PRIVATE-STOP-NAME',
                address: null,
                state: 'completed',
                shopperHours: {
                  timeZone: 'America/Chicago',
                  weekly: [
                    { weekday: 0, label: 'Sunday', isClosed: true, intervals: [] },
                    {
                      weekday: 1,
                      label: 'Monday',
                      isClosed: false,
                      intervals: [{ opensAt: '09:00', closesAt: '17:00' }],
                    },
                    { weekday: 2, label: 'Tuesday', isClosed: false, intervals: [] },
                    { weekday: 3, label: 'Wednesday', isClosed: false, intervals: [] },
                    { weekday: 4, label: 'Thursday', isClosed: false, intervals: [] },
                    { weekday: 5, label: 'Friday', isClosed: false, intervals: [] },
                    { weekday: 6, label: 'Saturday', isClosed: false, intervals: [] },
                  ],
                  holidays: [],
                  version: 1,
                },
              },
            ],
            visitMemories: [
              {
                memoryId: 'memory-attached',
                tripId: 'trip-1',
                stopId: 'stop-1',
                storeId: null,
                privateStopId: 'stop-1',
                privateStopName: 'PRIVATE-STOP-NAME',
                privateStopAddress: 'COMPLETED-MEMORY-ADDRESS-SNAPSHOT',
                rating: 5,
                returnChoice: 'yes',
                note: 'VISIT-MEMORY-NOTE',
              },
              {
                memoryId: 'memory-detached',
                tripId: 'trip-1',
                stopId: 'stop-2',
                storeId: null,
                privateStopId: null,
                privateStopName: 'DETACHED-STOP-SNAPSHOT',
                privateStopAddress: 'DETACHED-ADDRESS-SNAPSHOT',
                rating: 3,
                returnChoice: 'maybe',
                note: 'DETACHED-MEMORY-NOTE',
              },
              {
                memoryId: 'memory-catalog',
                tripId: 'trip-1',
                stopId: 'catalog-stop-1',
                storeId: 'store-1',
                privateStopId: null,
                privateStopName: null,
                privateStopAddress: null,
                rating: 4,
                returnChoice: 'yes',
                note: 'CATALOG-VISIT-MEMORY-NOTE',
              },
            ],
          },
          candidate: {},
        },
      }),
      async () => new Uint8Array(),
    )
    const entries = readStoredZipEntries(bytes)
    const userData = entries.get('user-data.json') ?? ''
    const summaryCsv = entries.get('tables/memories.csv') ?? ''
    const privateStopsCsv = entries.get('tables/private-stops.csv') ?? ''
    const visitMemoriesCsv = entries.get('tables/visit-memories.csv') ?? ''

    expect(entries.has('tables/memories.csv')).toBe(true)
    expect(summaryCsv).toContain('STORE-SUMMARY-NOTE')
    expect(summaryCsv).toContain("'" + String.fromCharCode(10) + '=1+1')
    expect(summaryCsv).not.toContain('VISIT-MEMORY-NOTE')
    expect(privateStopsCsv).toContain('PRIVATE-STOP-NAME')
    expect(privateStopsCsv).toContain('America/Chicago')
    expect(privateStopsCsv).toContain('09:00')
    expect(privateStopsCsv).not.toContain('[object Object]')
    expect(visitMemoriesCsv).toContain('VISIT-MEMORY-NOTE')
    expect(visitMemoriesCsv).toContain('memory-detached')
    expect(visitMemoriesCsv).toContain('COMPLETED-MEMORY-ADDRESS-SNAPSHOT')
    expect(visitMemoriesCsv).toContain('DETACHED-STOP-SNAPSHOT')
    expect(visitMemoriesCsv).toContain('DETACHED-ADDRESS-SNAPSHOT')
    expect(visitMemoriesCsv).toContain('CATALOG-VISIT-MEMORY-NOTE')
    expect(userData).toContain('"address":null')
  })
})
