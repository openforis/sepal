import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {MAX_ASSET_PROPERTY_BYTES} from '#sepal/earthEngineAssetProperties'
import {opticalBandEncoding} from '#sepal/recipe/optical/encoding'
import {selectableBands} from '#sepal/recipe/optical/opticalBands'
import {
    AGREED,
    ENCODING_PROPERTY,
    encodingFromProperties,
    encodingOfBands,
    encodingProperties,
    encodingPropertyKeys,
    MAX_ENCODING_PARTS,
    reconcileEncodings
} from '#sepal/recipe/output/bandEncoding'
import {sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'

// How an output's band encoding survives as Earth Engine asset metadata, where a string property holds at most
// 16,384 UTF-8 bytes. The property names, the version numbers and the limit are literals here: they are the
// stored contract, and assets written by earlier releases cannot be renamed along with the code.

const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}

const bytes = value => Buffer.byteLength(String(value), 'utf8')

describe('storing the encoding of an ordinary optical output', () => {
    it('holds a 31-band mosaic in one part', () => {
        const stored = encodingProperties(encodingOfBands(opticalOutputBands()))

        assert.deepEqual(JSON.parse(stored[ENCODING_PROPERTY]), {version: 2, parts: 1})
        assert.deepEqual(Object.keys(stored), [ENCODING_PROPERTY, 'sepal_band_encoding_1'])
        assert.ok(bytes(stored.sepal_band_encoding_1) < 2000)
        assert.deepEqual(encodingFromProperties(stored).nbr, {scale: 0.0001, offset: 0, unit: '1'})
    })
})

describe('storing an output with hundreds of bands', () => {
    // 24 measures expand to 293 bands, whose encoding exceeds what one property holds. The encodings are
    // fixtures for capacity only: CCDC Slice declares none.
    it('splits it into parts that each fit a property, and reads back the same facts', () => {
        const encoding = encodingOfBands(sliceShapedBands(24))

        const stored = encodingProperties(encoding)

        assert.ok(bytes(JSON.stringify(encoding)) > MAX_ASSET_PROPERTY_BYTES)
        assert.equal(
            Object.values(stored).every(value => bytes(value) <= MAX_ASSET_PROPERTY_BYTES),
            true
        )
        assert.deepEqual(encodingFromProperties(stored), encoding)
    })

    it('keeps the property count far below the number of bands', () => {
        const bands = sliceShapedBands(24)

        const stored = encodingProperties(encodingOfBands(bands))

        assert.equal(bands.length, 293)
        assert.ok(Object.keys(stored).length <= 4)
        assert.ok(JSON.parse(stored[ENCODING_PROPERTY]).parts > 1)
    })

    it('is read in one request, from keys named without reading the asset first', () => {
        const stored = encodingProperties(encodingOfBands(sliceShapedBands(24)))

        assert.equal(encodingPropertyKeys().length, MAX_ENCODING_PARTS + 1)
        assert.equal(
            Object.keys(stored).every(key => encodingPropertyKeys().includes(key)),
            true
        )
    })
})

describe('the size of a stored part', () => {
    it('fills a property to exactly the limit without splitting', () => {
        const stored = encodingProperties(encodingOfExactly(MAX_ASSET_PROPERTY_BYTES))

        assert.equal(bytes(stored.sepal_band_encoding_1), 16384)
        assert.equal(JSON.parse(stored[ENCODING_PROPERTY]).parts, 1)
    })

    it('splits at the first byte over the limit', () => {
        const stored = encodingProperties(encodingOfExactly(MAX_ASSET_PROPERTY_BYTES + 1))

        assert.equal(JSON.parse(stored[ENCODING_PROPERTY]).parts, 2)
        assert.equal(
            Object.values(stored).every(value => bytes(value) <= MAX_ASSET_PROPERTY_BYTES),
            true
        )
    })

    // Fewer characters than the limit allows, more bytes than it allows: a limit counted in characters would
    // keep this in one part, and lose it.
    it('measures multibyte content in bytes, not characters', () => {
        const encoding = multibyteEncoding()
        const value = JSON.stringify(encoding)
        assert.ok(value.length < MAX_ASSET_PROPERTY_BYTES)
        assert.ok(bytes(value) > MAX_ASSET_PROPERTY_BYTES)

        const stored = encodingProperties(encoding)

        assert.ok(JSON.parse(stored[ENCODING_PROPERTY]).parts > 1)
        assert.equal(
            Object.values(stored).every(part => bytes(part) <= MAX_ASSET_PROPERTY_BYTES),
            true
        )
        assert.deepEqual(encodingFromProperties(stored), encoding)
    })
})

describe('an encoding that cannot be represented', () => {
    it('refuses a single band whose entry exceeds a whole property, naming it, its size and the limit', () => {
        const name = `b${'x'.repeat(MAX_ASSET_PROPERTY_BYTES)}`

        const {message} = refusal(() => encodingProperties({[name]: REFLECTANCE}))

        assert.ok(message.includes(name))
        assert.ok(message.includes(String(MAX_ASSET_PROPERTY_BYTES)))
        assert.ok(Number(message.match(/(\d+) bytes/)[1]) > MAX_ASSET_PROPERTY_BYTES)
    })

    it('refuses more parts than can be read back', () => {
        const encoding = {}
        for (let part = 0; part <= MAX_ENCODING_PARTS; part++) {
            Object.assign(encoding, prefixed(encodingOfExactly(MAX_ASSET_PROPERTY_BYTES), `p${part}_`))
        }

        assert.throws(() => encodingProperties(encoding), /64 parts/)
    })
})

describe('an empty encoding', () => {
    it('is stored as an authoritative statement that nothing is known', () => {
        const stored = encodingProperties({})

        assert.deepEqual(stored, {[ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 0})})
        assert.deepEqual(encodingFromProperties(stored), {})
    })

    it('leaves obsolete parts beside it unread', () => {
        const stored = {
            ...encodingProperties({}),
            sepal_band_encoding_1: JSON.stringify({red: THERMAL})
        }

        assert.deepEqual(encodingFromProperties(stored), {})
    })
})

describe('reading what an earlier release stored', () => {
    it('reads a single version 1 property, as the assets in use hold it', () => {
        const stored = {[ENCODING_PROPERTY]: JSON.stringify({version: 1, bands: {red: REFLECTANCE}})}

        assert.deepEqual(
            encodingFromProperties(stored),
            {red: {scale: 0.0001, offset: 0, unit: '1'}}
        )
    })

    it('reads a version 1 property that states nothing as nothing known', () => {
        const stored = {[ENCODING_PROPERTY]: JSON.stringify({version: 1, bands: {}})}

        assert.deepEqual(encodingFromProperties(stored), {})
    })

    it('ignores parts left beside a version 1 property', () => {
        const stored = {
            [ENCODING_PROPERTY]: JSON.stringify({version: 1, bands: {red: REFLECTANCE}}),
            sepal_band_encoding_1: JSON.stringify({thermal: THERMAL})
        }

        assert.deepEqual(encodingFromProperties(stored), {red: REFLECTANCE})
    })
})

describe('reading an incomplete or unreadable representation', () => {
    const complete = () => encodingProperties({red: REFLECTANCE, thermal: THERMAL})

    for (const [scenario, damage] of [
        ['a part the manifest names is absent', stored => ({...stored, sepal_band_encoding_1: undefined})],
        ['a part is not JSON', stored => ({...stored, sepal_band_encoding_1: 'not json'})],
        ['a part is not a dictionary of bands', stored => ({...stored, sepal_band_encoding_1: '[1,2,3]'})],
        ['the manifest is not JSON', stored => ({...stored, [ENCODING_PROPERTY]: '{'})],
        ['the manifest states a version nothing here writes', stored => ({
            ...stored, [ENCODING_PROPERTY]: JSON.stringify({version: 3, parts: 1})
        })],
        ['the manifest states more parts than it wrote', stored => ({
            ...stored, [ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 2})
        })],
        ['the manifest states no part count', stored => ({
            ...stored, [ENCODING_PROPERTY]: JSON.stringify({version: 2})
        })],
        ['nothing states the representation', stored => ({...stored, [ENCODING_PROPERTY]: undefined})]
    ]) {
        it(`is unknown rather than partial when ${scenario}`, () => {
            assert.deepEqual(encodingFromProperties(damage(complete())), {})
        })
    }

    it('withholds only the band whose entry is malformed, where the parts are all there', () => {
        const stored = encodingProperties({red: REFLECTANCE, thermal: THERMAL})
        const damaged = {
            ...stored,
            sepal_band_encoding_1: JSON.stringify({
                ...JSON.parse(stored.sepal_band_encoding_1),
                thermal: {scale: 0}
            })
        }

        assert.deepEqual(encodingFromProperties(damaged), {red: REFLECTANCE})
    })
})

describe('comparing stored facts', () => {
    it('agrees across the representations that hold them, whatever the layout', () => {
        const facts = {red: REFLECTANCE, thermal: THERMAL}
        const chunked = encodingFromProperties(encodingProperties(facts))
        const legacy = encodingFromProperties({
            [ENCODING_PROPERTY]: JSON.stringify({version: 1, bands: {thermal: THERMAL, red: REFLECTANCE}})
        })

        assert.equal(reconcileEncodings(chunked, legacy), AGREED)
    })

    it('agrees where the same facts are split differently', () => {
        const facts = encodingOfBands(sliceShapedBands(24))
        const split = encodingFromProperties(encodingProperties(facts))

        assert.equal(reconcileEncodings(split, facts), AGREED)
    })
})

const opticalOutputBands = () => selectableBands({
    sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
    compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
}).map(name => ({name, encoding: opticalBandEncoding(name)}))

// The band names a slice of that many measures actually produces, with a fixture encoding on the bands derived
// from a measure. What those bands mean is not established here; only how much metadata they take.
const sliceShapedBands = measures => {
    const base = Array.from({length: measures}, (_value, index) => `measure_${index + 1}`)
    const physical = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', ...base.map(name => `${name}_coefs`)]
    const model = {date: {dateType: 'SINGLE'}, options: {gapStrategy: 'INTERPOLATE', harmonics: 3}}
    return sliceOutputBands(physical, model).map(name => ({
        name,
        ...(base.some(measure => name.startsWith(measure)) ? {encoding: REFLECTANCE} : {})
    }))
}

// A dictionary of bands whose JSON is exactly this many bytes, so a limit can be met and then passed by one byte.
const encodingOfExactly = size => {
    const bands = {}
    let index = 0
    for (;;) {
        const candidate = {...bands, [`b${index}`]: REFLECTANCE, t: REFLECTANCE}
        if (bytes(JSON.stringify(candidate)) > size) {
            break
        }
        bands[`b${index++}`] = REFLECTANCE
    }
    const padding = size - bytes(JSON.stringify({...bands, t: REFLECTANCE}))
    if (padding < 0) {
        throw new Error(`Cannot build an encoding of exactly ${size} bytes`)
    }
    return {...bands, [`t${'x'.repeat(padding)}`]: REFLECTANCE}
}

const multibyteEncoding = () => {
    const encoding = {}
    let index = 0
    while (JSON.stringify(encoding).length < MAX_ASSET_PROPERTY_BYTES - 200) {
        encoding[`mätning_${index++}_ståndpunkt`] = {scale: 0.01, offset: -273.15, unit: '°C·µg·m⁻³'}
    }
    return encoding
}

const prefixed = (encoding, prefix) => Object.fromEntries(
    Object.entries(encoding).map(([name, value]) => [`${prefix}${name}`, value])
)

const refusal = operation => {
    try {
        operation()
    } catch (error) {
        return error
    }
    throw new Error('Expected the encoding to be refused')
}
