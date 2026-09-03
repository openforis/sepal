import {AWS_INSTANCE_TYPES, LOCAL_INSTANCE_TYPES} from './instanceTypes.js'

test('AWS catalog has 62 instance types', () => {
    expect(AWS_INSTANCE_TYPES).toHaveLength(62)
})

test('Local catalog has 43 instance types', () => {
    expect(LOCAL_INSTANCE_TYPES).toHaveLength(43)
})

const REQUIRED_FIELDS = ['id', 'name', 'cpuCount', 'ramGiB', 'hourlyCost', 'idleCount', 'devices', 'description']

test('every AWS type has all 8 required fields', () => {
    for (const t of AWS_INSTANCE_TYPES) {
        for (const field of REQUIRED_FIELDS) {
            expect(t).toHaveProperty(field)
        }
    }
})

test('every Local type has all 8 required fields', () => {
    for (const t of LOCAL_INSTANCE_TYPES) {
        for (const field of REQUIRED_FIELDS) {
            expect(t).toHaveProperty(field)
        }
    }
})

test('description is "$cpuCount CPU, $ramGiB GiB"', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'T3aSmall')
    expect(t.description).toBe('1 CPU, 2 GiB')
})

test('description shows the GPU count right after the CPU count when gpuCount > 0', () => {
    expect(AWS_INSTANCE_TYPES.find(x => x.id === 'G5Xlarge').description).toBe('4 CPU, 1 GPU, 16 GiB')
    expect(AWS_INSTANCE_TYPES.find(x => x.id === 'G512xlarge').description).toBe('48 CPU, 4 GPU, 192 GiB')
})

test('ramBytes is ramGiB * 2^30', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'M6aLarge')
    expect(t.ramBytes).toBeCloseTo(8 * Math.pow(2, 30))
})

test('AWS T3aSmall has idleCount=1 and correct fields', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'T3aSmall')
    expect(t).toMatchObject({
        id: 'T3aSmall',
        name: 't3a.small',
        tag: 't1',
        hourlyCost: 0.0204,
        cpuCount: 1,
        ramGiB: 2,
        idleCount: 1,
    })
})

test('AWS T3aMedium has idleCount=0 (default)', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'T3aMedium')
    expect(t.idleCount).toBe(0)
    expect(t.tag).toBe('t2')
})

test('AWS M6a12xlarge matches Groovy verbatim', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'M6a12xlarge')
    expect(t).toMatchObject({
        id: 'M6a12xlarge',
        name: 'm6a.12xlarge',
        tag: 'm48',
        hourlyCost: 2.3112,
        cpuCount: 48,
        ramGiB: 192,
    })
})

test('AWS C7a12xlarge is c7a.12xlarge', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'C7a12xlarge')
    expect(t).toMatchObject({
        id: 'C7a12xlarge',
        name: 'c7a.12xlarge',
        tag: 'c48',
        hourlyCost: 2.64288,
        cpuCount: 48,
        ramGiB: 96,
    })
})

test('AWS C7a16xlarge is c7a.16xlarge', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'C7a16xlarge')
    expect(t).toMatchObject({
        id: 'C7a16xlarge',
        name: 'c7a.16xlarge',
        tag: 'c64',
        hourlyCost: 3.52384,
        cpuCount: 64,
        ramGiB: 128,
    })
})

// The c7a family prices linearly off c7a.large, so each entry is 0.11012 * cpuCount / 2.
test('AWS c7a hourly costs scale linearly with cpuCount', () => {
    const c7a = AWS_INSTANCE_TYPES.filter(({name}) => name.startsWith('c7a.'))
    expect(c7a).toHaveLength(7)
    for (const {id, cpuCount, hourlyCost} of c7a) {
        expect([id, hourlyCost]).toEqual([id, Number((0.11012 * cpuCount / 2).toFixed(5))])
    }
})

// M5a12xlarge's name must be m5a.12xlarge: `name` IS the launched type, and m4.10xlarge would
// collide with M410xlarge's name — sending M5a12xlarge sessions to an m4.10xlarge.
// cpuCount/ramGiB/hourlyCost all describe m5a.12xlarge.
test('AWS M5a12xlarge is m5a.12xlarge', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'M5a12xlarge')
    expect(t.name).toBe('m5a.12xlarge')
    expect(t.cpuCount).toBe(48)
    expect(t.ramGiB).toBe(192)
})

test('AWS R4Large has non-integer ramGiB=15.25', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'R4Large')
    expect(t).toMatchObject({
        hourlyCost: 0.148,
        cpuCount: 2,
        ramGiB: 15.25,
    })
})

test('AWS X132xlarge has ramGiB=1920 and cpuCount=128', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'X132xlarge')
    expect(t).toMatchObject({
        name: 'x1.32xlarge',
        tag: 'x128',
        hourlyCost: 16.006,
        cpuCount: 128,
        ramGiB: 1920,
    })
})

test('AWS G5Xlarge is a GPU type with empty devices array (to be set by provisioner)', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'G5Xlarge')
    expect(t).toMatchObject({
        name: 'g5.xlarge',
        tag: 'g4',
        hourlyCost: 1.123,
        cpuCount: 4,
        ramGiB: 16,
    })
    expect(Array.isArray(t.devices)).toBe(true)
})

test('AWS G512xlarge spot-check', () => {
    const t = AWS_INSTANCE_TYPES.find(x => x.id === 'G512xlarge')
    expect(t).toMatchObject({
        name: 'g5.12xlarge',
        tag: 'g48',
        hourlyCost: 6.332,
        cpuCount: 48,
        ramGiB: 192,
    })
})

test('Local T3aSmall has idleCount=1', () => {
    const t = LOCAL_INSTANCE_TYPES.find(x => x.id === 'T3aSmall')
    expect(t).toMatchObject({
        id: 'T3aSmall',
        name: 't3a.small',
        tag: 't1',
        hourlyCost: 0.0204,
        cpuCount: 1,
        ramGiB: 2,
        idleCount: 1,
    })
})

test('Local M5a12xlarge is m5a.12xlarge', () => {
    const t = LOCAL_INSTANCE_TYPES.find(x => x.id === 'M5a12xlarge')
    expect(t.name).toBe('m5a.12xlarge')
    expect(t.tag).toBe('m48')
})

test('Local G512xlarge spot-check', () => {
    const t = LOCAL_INSTANCE_TYPES.find(x => x.id === 'G512xlarge')
    expect(t).toMatchObject({
        name: 'g5.12xlarge',
        tag: 'g48',
        hourlyCost: 6.332,
        cpuCount: 48,
        ramGiB: 192,
    })
})

test('AWS list order: first entry is T3aSmall, second is T3aMedium', () => {
    expect(AWS_INSTANCE_TYPES[0].id).toBe('T3aSmall')
    expect(AWS_INSTANCE_TYPES[1].id).toBe('T3aMedium')
})

test('Local list order: first entry is T3aSmall, third is M5aLarge', () => {
    expect(LOCAL_INSTANCE_TYPES[0].id).toBe('T3aSmall')
    expect(LOCAL_INSTANCE_TYPES[2].id).toBe('M5aLarge')
})

test('AWS IDs are unique', () => {
    const ids = AWS_INSTANCE_TYPES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
})

test('Local IDs are unique', () => {
    const ids = LOCAL_INSTANCE_TYPES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
})

// `name` is the EC2 instance-type value: it is what RunInstances launches and what the
// `instance-type` filter matches (awsInstanceProvider's codec translates id ↔ name). A duplicate
// name makes name → id ambiguous, so two ids would collapse onto one and the round-trip would
// silently return the wrong instance type.
test('AWS names are unique', () => {
    const names = AWS_INSTANCE_TYPES.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
})

test('Local names are unique', () => {
    const names = LOCAL_INSTANCE_TYPES.map(t => t.name)
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

test.each([['AWS', AWS_INSTANCE_TYPES], ['Local', LOCAL_INSTANCE_TYPES]])(
    '%s ids and names describe the same instance type', (_label, instanceTypes) => {
        for (const {id, name} of instanceTypes) {
            expect(idImpliedByName(name)).toBe(id)
        }
    }
)

describe('instanceTypes gpuCount count', () => {
    it('defaults gpuCount to 0', () => {
        const t3a = AWS_INSTANCE_TYPES.find(({id}) => id === 'T3aSmall')
        expect(t3a.gpuCount).toBe(0)
    })

    it('gives g5 types their GPU count in both catalogs', () => {
        for (const catalog of [AWS_INSTANCE_TYPES, LOCAL_INSTANCE_TYPES]) {
            const g5 = catalog.filter(({name}) => name.startsWith('g5.'))
            expect(g5.length).toBeGreaterThan(0)
            g5.forEach(type => expect(type.gpuCount).toBeGreaterThanOrEqual(1))
        }
        const g5xlarge = AWS_INSTANCE_TYPES.find(({name}) => name === 'g5.xlarge')
        expect(g5xlarge.gpuCount).toBe(1)
    })

    it('non-g5 types have no gpus', () => {
        AWS_INSTANCE_TYPES
            .filter(({name}) => !name.startsWith('g5.'))
            .forEach(type => expect(type.gpuCount).toBe(0))
    })
})
