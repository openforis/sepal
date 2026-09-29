import {INSTANCE_TYPES} from './instanceTypes.js'

test('catalog has 90 instance types', () => {
    expect(INSTANCE_TYPES).toHaveLength(90)
})

const REQUIRED_FIELDS = ['id', 'name', 'cpuCount', 'ramGiB', 'hourlyCost', 'idleCount', 'devices', 'description']

test('every type has all 8 required fields', () => {
    for (const t of INSTANCE_TYPES) {
        for (const field of REQUIRED_FIELDS) {
            expect(t).toHaveProperty(field)
        }
    }
})

test('description is "$cpuCount CPU, $ramGiB GB"', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'T3aSmall')
    expect(t.description).toBe('2 CPU, 2 GB')
})

test('description shows the GPU count right after the CPU count when gpuCount > 0', () => {
    expect(INSTANCE_TYPES.find(x => x.id === 'G5Xlarge').description).toBe('4 CPU, 1 GPU, 16 GB')
    expect(INSTANCE_TYPES.find(x => x.id === 'G512xlarge').description).toBe('48 CPU, 4 GPU, 192 GB')
})

test('ramBytes is ramGiB * 2^30', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'M6aLarge')
    expect(t.ramBytes).toBeCloseTo(8 * Math.pow(2, 30))
})

test('T3aSmall has correct fields', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'T3aSmall')
    expect(t).toMatchObject({
        id: 'T3aSmall',
        name: 't3a.small',
        tag: 't1',
        hourlyCost: 0.0204,
        cpuCount: 2,
        ramGiB: 2,
    })
})

// Requests are served from the stopped pool (STOPPED_POOL_SIZE) instead of running idle instances.
test('no instance type keeps running idle instances', () => {
    const idle = INSTANCE_TYPES.filter(t => t.idleCount > 0)
    expect(idle.map(({id}) => id)).toEqual([])
})

test('T3aMedium has idleCount=0 (default)', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'T3aMedium')
    expect(t.idleCount).toBe(0)
    expect(t.tag).toBe('t2')
})

test('M6a12xlarge matches Groovy verbatim', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'M6a12xlarge')
    expect(t).toMatchObject({
        id: 'M6a12xlarge',
        name: 'm6a.12xlarge',
        tag: 'm48',
        hourlyCost: 2.3112,
        cpuCount: 48,
        ramGiB: 192,
    })
})

test('C8a12xlarge is c8a.12xlarge', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'C8a12xlarge')
    expect(t).toMatchObject({
        id: 'C8a12xlarge',
        name: 'c8a.12xlarge',
        tag: 'c48',
        hourlyCost: 2.77512,
        cpuCount: 48,
        ramGiB: 96,
    })
})

// The c8a family prices linearly off c8a.large, so each entry is 0.11563 * cpuCount / 2.
test('c8a hourly costs scale linearly with cpuCount', () => {
    const c8a = INSTANCE_TYPES.filter(({name}) => name.startsWith('c8a.'))
    expect(c8a).toHaveLength(7)
    for (const {id, cpuCount, hourlyCost} of c8a) {
        expect([id, hourlyCost]).toEqual([id, Number((0.11563 * cpuCount / 2).toFixed(5))])
    }
})

// A replaced type stays in the catalog untagged: sessions recorded on it still resolve, but it is
// no longer offered.
test('c7a and x1 types remain as untagged legacy types', () => {
    const legacy = INSTANCE_TYPES.filter(({name}) => name.startsWith('c7a.') || name.startsWith('x1.'))
    expect(legacy).toHaveLength(9)
    legacy.forEach(type => expect(type.tag).toBeUndefined())
})

// The GUI picker and the SSH menu both select an instance type by its tag.
test('tags are unique', () => {
    const tags = INSTANCE_TYPES.map(({tag}) => tag).filter(Boolean)
    expect(new Set(tags).size).toBe(tags.length)
})

// M5a12xlarge's name must be m5a.12xlarge: `name` IS the launched type, and m4.10xlarge would
// collide with M410xlarge's name — sending M5a12xlarge sessions to an m4.10xlarge.
// cpuCount/ramGiB/hourlyCost all describe m5a.12xlarge.
test('M5a12xlarge is m5a.12xlarge', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'M5a12xlarge')
    expect(t.name).toBe('m5a.12xlarge')
    expect(t.cpuCount).toBe(48)
    expect(t.ramGiB).toBe(192)
})

test('R4Large has non-integer ramGiB=15.25', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'R4Large')
    expect(t).toMatchObject({
        hourlyCost: 0.148,
        cpuCount: 2,
        ramGiB: 15.25,
    })
})

test('X2idn32xlarge is x2idn.32xlarge with its NVMe capacity', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'X2idn32xlarge')
    expect(t).toMatchObject({
        name: 'x2idn.32xlarge',
        tag: 'x128',
        hourlyCost: 16.006,
        cpuCount: 128,
        ramGiB: 2048,
        ssdGB: 3800,
    })
})

// Each SSD tier is its base tier's tag with a trailing "d": m4d is the m4 shape with local NVMe.
test('SSD tiers have local NVMe and the shape of their base tier', () => {
    const byTag = Object.fromEntries(INSTANCE_TYPES.filter(({tag}) => tag).map(type => [type.tag, type]))
    const ssdTags = Object.keys(byTag).filter(tag => /^[mcr]\d+d$/.test(tag))
    expect(ssdTags).toHaveLength(19)
    for (const tag of ssdTags) {
        const base = byTag[tag.slice(0, -1)]
        expect([tag, byTag[tag].ssdGB > 0]).toEqual([tag, true])
        expect([tag, byTag[tag].cpuCount, byTag[tag].ramGiB]).toEqual([tag, base.cpuCount, base.ramGiB])
    }
})

test('ssdGB defaults to 0', () => {
    expect(INSTANCE_TYPES.find(x => x.id === 'M6aLarge').ssdGB).toBe(0)
})

test('performance is relative to t3a.small', () => {
    expect(INSTANCE_TYPES.find(x => x.id === 'T3aSmall').performance).toBe(1)
    INSTANCE_TYPES.forEach(type => expect([type.id, type.performance]).toEqual([type.id, expect.any(Number)]))
})

test('G5Xlarge is a GPU type with empty devices array (to be set by provisioner)', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'G5Xlarge')
    expect(t).toMatchObject({
        name: 'g5.xlarge',
        tag: 'g4',
        hourlyCost: 1.123,
        cpuCount: 4,
        ramGiB: 16,
    })
    expect(Array.isArray(t.devices)).toBe(true)
})

test('G512xlarge spot-check', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'G512xlarge')
    expect(t).toMatchObject({
        name: 'g5.12xlarge',
        tag: 'g48',
        hourlyCost: 6.332,
        cpuCount: 48,
        ramGiB: 192,
    })
})

test('list order: first entry is T3aSmall, second is T3aMedium', () => {
    expect(INSTANCE_TYPES[0].id).toBe('T3aSmall')
    expect(INSTANCE_TYPES[1].id).toBe('T3aMedium')
})

test('IDs are unique', () => {
    const ids = INSTANCE_TYPES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
})

// `name` is the EC2 instance-type value: it is what RunInstances launches and what the
// `instance-type` filter matches (awsInstanceProvider's codec translates id ↔ name). A duplicate
// name makes name → id ambiguous, so two ids would collapse onto one and the round-trip would
// silently return the wrong instance type.
test('names are unique', () => {
    const names = INSTANCE_TYPES.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
})

// The ids follow the AWS SDK's `InstanceType` enum convention: 'm5a.12xlarge' → 'M5a' +
// '12xlarge' = 'M5a12xlarge'. Holding to it keeps id and name describing the same machine, so a
// mismatch is a typo in one of the two.
const idImpliedByName = name => {
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
    const [family, size] = name.split('.')
    return cap(family) + cap(size)
}

test('ids and names describe the same instance type', () => {
    for (const {id, name} of INSTANCE_TYPES) {
        expect(idImpliedByName(name)).toBe(id)
    }
})

describe('instanceTypes gpuCount count', () => {
    it('defaults gpuCount to 0', () => {
        const t3a = INSTANCE_TYPES.find(({id}) => id === 'T3aSmall')
        expect(t3a.gpuCount).toBe(0)
    })

    it('gives g5 types their GPU count', () => {
        const g5 = INSTANCE_TYPES.filter(({name}) => name.startsWith('g5.'))
        expect(g5.length).toBeGreaterThan(0)
        g5.forEach(type => expect(type.gpuCount).toBeGreaterThanOrEqual(1))
        const g5xlarge = INSTANCE_TYPES.find(({name}) => name === 'g5.xlarge')
        expect(g5xlarge.gpuCount).toBe(1)
    })

    it('non-g5 types have no gpus', () => {
        INSTANCE_TYPES
            .filter(({name}) => !name.startsWith('g5.'))
            .forEach(type => expect(type.gpuCount).toBe(0))
    })
})
