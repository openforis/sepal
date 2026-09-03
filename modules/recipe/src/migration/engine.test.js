import {currentVersion, migrate} from './engine.js'

const migrations = {
    5: r => ({...r, e: 5}),
    7: r => ({...r, g: 7})
}

test('currentVersion is the highest key (1 when empty)', () => {
    expect(currentVersion(migrations)).toBe(7)
    expect(currentVersion({})).toBe(1)
})

test('migrate applies migrations with key > fromVersion ascending, stamps currentVersion', () => {
    const out = migrate({base: true}, 0, migrations)
    expect(out.typeVersion).toBe(7)
    expect(out.contents).toEqual({base: true, e: 5, g: 7})
})

test('migrate skips migrations at or below fromVersion', () => {
    const out = migrate({base: true}, 5, migrations)
    expect(out.contents).toEqual({base: true, g: 7})
    expect(out.typeVersion).toBe(7)
})

test('a falsey baseline entry pins the version without running anything', () => {
    const out = migrate({base: true}, 5, {5: false})
    expect(out.contents).toEqual({base: true})
    expect(out.typeVersion).toBe(5)
})

test('migrate skips falsey entries in range but still applies later real migrations', () => {
    const out = migrate({base: true}, 4, {5: false, 6: r => ({...r, f: 6})})
    expect(out.contents).toEqual({base: true, f: 6})
    expect(out.typeVersion).toBe(6)
})

test('migrate supports closures returning a brand-new object', () => {
    const out = migrate({old: true}, 0, {6: () => ({replaced: true})})
    expect(out.contents).toEqual({replaced: true})
})
