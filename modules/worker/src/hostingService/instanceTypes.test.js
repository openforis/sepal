import assert from 'node:assert/strict'
import {describe, it, test} from 'node:test'

import {INSTANCE_TYPES} from './instanceTypes.js'

test('catalog has 90 instance types', () => {
    assert.equal(INSTANCE_TYPES.length, 90)
})

const REQUIRED_FIELDS = ['id', 'name', 'cpuCount', 'ramGiB', 'hourlyCost', 'idleCount', 'devices', 'description']

test('every type has all 8 required fields', () => {
    for (const t of INSTANCE_TYPES) {
        for (const field of REQUIRED_FIELDS) {
            assert.ok(field in t, `${t.id} has no ${field}`)
        }
    }
})

test('description is "$cpuCount CPU, $ramGiB GB"', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'T3aSmall')
    assert.equal(t.description, '2 CPU, 2 GB')
})

test('description shows the GPU count right after the CPU count when gpuCount > 0', () => {
    assert.equal(
        INSTANCE_TYPES.find(x => x.id === 'G5Xlarge').description,
        '4 CPU, 1 GPU, 16 GB'
    )
    assert.equal(
        INSTANCE_TYPES.find(x => x.id === 'G512xlarge').description,
        '48 CPU, 4 GPU, 192 GB'
    )
})

test('ramBytes is ramGiB * 2^30', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'M6aLarge')
    assert.ok(Math.abs(t.ramBytes - 8 * Math.pow(2, 30)) < 10 ** -2 / 2)
})

test('T3aSmall has correct fields', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'T3aSmall')
    assert.partialDeepStrictEqual(t, {
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
    assert.deepEqual(idle.map(({id}) => id), [])
})

test('T3aMedium has idleCount=0 (default)', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'T3aMedium')
    assert.equal(t.idleCount, 0)
    assert.equal(t.tag, 't2')
})

test('M6a12xlarge matches Groovy verbatim', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'M6a12xlarge')
    assert.partialDeepStrictEqual(t, {
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
    assert.partialDeepStrictEqual(t, {
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
    assert.equal(c8a.length, 7)
    for (const {id, cpuCount, hourlyCost} of c8a) {
        assert.deepEqual([id, hourlyCost], [id, Number((0.11563 * cpuCount / 2).toFixed(5))])
    }
})

// A replaced type stays in the catalog untagged: sessions recorded on it still resolve, but it is
// no longer offered.
test('c7a and x1 types remain as untagged legacy types', () => {
    const legacy = INSTANCE_TYPES.filter(({name}) => name.startsWith('c7a.') || name.startsWith('x1.'))
    assert.equal(legacy.length, 9)
    legacy.forEach(type => assert.equal(type.tag, undefined))
})

// The GUI picker and the SSH menu both select an instance type by its tag.
test('tags are unique', () => {
    const tags = INSTANCE_TYPES.map(({tag}) => tag).filter(Boolean)
    assert.equal(new Set(tags).size, tags.length)
})

// M5a12xlarge's name must be m5a.12xlarge: `name` IS the launched type, and m4.10xlarge would
// collide with M410xlarge's name — sending M5a12xlarge sessions to an m4.10xlarge.
// cpuCount/ramGiB/hourlyCost all describe m5a.12xlarge.
test('M5a12xlarge is m5a.12xlarge', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'M5a12xlarge')
    assert.equal(t.name, 'm5a.12xlarge')
    assert.equal(t.cpuCount, 48)
    assert.equal(t.ramGiB, 192)
})

test('R4Large has non-integer ramGiB=15.25', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'R4Large')
    assert.partialDeepStrictEqual(t, {
        hourlyCost: 0.148,
        cpuCount: 2,
        ramGiB: 15.25,
    })
})

test('X2idn32xlarge is x2idn.32xlarge with its NVMe capacity', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'X2idn32xlarge')
    assert.partialDeepStrictEqual(t, {
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
    assert.equal(ssdTags.length, 19)
    for (const tag of ssdTags) {
        const base = byTag[tag.slice(0, -1)]
        assert.deepEqual([tag, byTag[tag].ssdGB > 0], [tag, true])
        assert.deepEqual(
            [tag, byTag[tag].cpuCount, byTag[tag].ramGiB],
            [tag, base.cpuCount, base.ramGiB]
        )
    }
})

test('ssdGB defaults to 0', () => {
    assert.equal(INSTANCE_TYPES.find(x => x.id === 'M6aLarge').ssdGB, 0)
})

test('performance is relative to t3a.small', () => {
    assert.equal(INSTANCE_TYPES.find(x => x.id === 'T3aSmall').performance, 1)
    INSTANCE_TYPES.forEach(type => assert.deepEqual([type.id, typeof type.performance], [type.id, 'number']))
})

test('G5Xlarge is a GPU type with empty devices array (to be set by provisioner)', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'G5Xlarge')
    assert.partialDeepStrictEqual(t, {
        name: 'g5.xlarge',
        tag: 'g4',
        hourlyCost: 1.123,
        cpuCount: 4,
        ramGiB: 16,
    })
    assert.equal(Array.isArray(t.devices), true)
})

test('G512xlarge spot-check', () => {
    const t = INSTANCE_TYPES.find(x => x.id === 'G512xlarge')
    assert.partialDeepStrictEqual(t, {
        name: 'g5.12xlarge',
        tag: 'g48',
        hourlyCost: 6.332,
        cpuCount: 48,
        ramGiB: 192,
    })
})

test('list order: first entry is T3aSmall, second is T3aMedium', () => {
    assert.equal(INSTANCE_TYPES[0].id, 'T3aSmall')
    assert.equal(INSTANCE_TYPES[1].id, 'T3aMedium')
})

test('IDs are unique', () => {
    const ids = INSTANCE_TYPES.map(t => t.id)
    assert.equal(new Set(ids).size, ids.length)
})

// `name` is the EC2 instance-type value: it is what RunInstances launches and what the
// `instance-type` filter matches (awsInstanceProvider's codec translates id ↔ name). A duplicate
// name makes name → id ambiguous, so two ids would collapse onto one and the round-trip would
// silently return the wrong instance type.
test('names are unique', () => {
    const names = INSTANCE_TYPES.map(t => t.name)
    assert.equal(new Set(names).size, names.length)
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
        assert.equal(idImpliedByName(name), id)
    }
})

describe('instanceTypes gpuCount count', () => {
    it('defaults gpuCount to 0', () => {
        const t3a = INSTANCE_TYPES.find(({id}) => id === 'T3aSmall')
        assert.equal(t3a.gpuCount, 0)
    })

    it('gives g5 types their GPU count', () => {
        const g5 = INSTANCE_TYPES.filter(({name}) => name.startsWith('g5.'))
        assert.ok(g5.length > 0)
        g5.forEach(type => assert.ok(type.gpuCount >= 1))
        const g5xlarge = INSTANCE_TYPES.find(({name}) => name === 'g5.xlarge')
        assert.equal(g5xlarge.gpuCount, 1)
    })

    it('non-g5 types have no gpus', () => {
        INSTANCE_TYPES
            .filter(({name}) => !name.startsWith('g5.'))
            .forEach(type => assert.equal(type.gpuCount, 0))
    })
})
