import {InstanceStatus} from '../workerInstance/instanceStatus.js'
import {createMissingInstanceTracker} from './missingInstanceTracker.js'

const {MISSING, PROVISIONED, UNKNOWN} = InstanceStatus

const BACKSTOP_MS = 30 * 60_000

// A tracker over a clock the test advances by hand.
const build = () => {
    let now = new Date('2026-01-01T12:00:00Z')
    const tracker = createMissingInstanceTracker({
        missesBeforeClose: 2,
        unknownBackstopMs: BACKSTOP_MS,
        clock: () => now,
    })
    return {tracker, advance: ms => {now = new Date(now.getTime() + ms)}}
}

test('a single MISSING does not close — one blip is not proof of death', () => {
    const {tracker} = build()
    expect(tracker.record('s-1', MISSING)).toBe(false)
})

test('MISSING confirmed on the next sweep closes', () => {
    const {tracker} = build()
    tracker.record('s-1', MISSING)
    expect(tracker.record('s-1', MISSING)).toBe(true)
})

test('PROVISIONED between two MISSING resets the count', () => {
    const {tracker} = build()
    tracker.record('s-1', MISSING)
    tracker.record('s-1', PROVISIONED)
    expect(tracker.record('s-1', MISSING)).toBe(false)
})

test('counts are per session', () => {
    const {tracker} = build()
    tracker.record('s-1', MISSING)
    expect(tracker.record('s-2', MISSING)).toBe(false)
})

test('UNKNOWN never closes on its own, however often it repeats', () => {
    const {tracker} = build()
    for (let i = 0; i < 20; i++) {
        expect(tracker.record('s-1', UNKNOWN)).toBe(false)
    }
})

test('UNKNOWN sustained past the backstop closes, so an unreachable host cannot bill forever', () => {
    const {tracker, advance} = build()
    tracker.record('s-1', UNKNOWN)
    advance(BACKSTOP_MS)
    expect(tracker.record('s-1', UNKNOWN)).toBe(true)
})

test('the backstop clock restarts when the instance is seen again', () => {
    const {tracker, advance} = build()
    tracker.record('s-1', UNKNOWN)
    advance(BACKSTOP_MS - 1000)
    tracker.record('s-1', PROVISIONED)
    tracker.record('s-1', UNKNOWN)
    advance(BACKSTOP_MS - 1000)
    expect(tracker.record('s-1', UNKNOWN)).toBe(false)
})

// An inconclusive probe is not evidence of life, so it must not undo a confirmed denial.
test('UNKNOWN between two MISSING does not reset the count', () => {
    const {tracker} = build()
    tracker.record('s-1', MISSING)
    tracker.record('s-1', UNKNOWN)
    expect(tracker.record('s-1', MISSING)).toBe(true)
})

test('retain drops sessions that are no longer swept', () => {
    const {tracker} = build()
    tracker.record('s-1', MISSING)
    tracker.retain(['s-2'])
    expect(tracker.record('s-1', MISSING)).toBe(false)
})
