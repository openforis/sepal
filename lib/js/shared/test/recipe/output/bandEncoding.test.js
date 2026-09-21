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

        expect(JSON.parse(stored[ENCODING_PROPERTY])).toEqual({version: 2, parts: 1})
        expect(Object.keys(stored)).toEqual([ENCODING_PROPERTY, 'sepal_band_encoding_1'])
        expect(bytes(stored.sepal_band_encoding_1)).toBeLessThan(2000)
        expect(encodingFromProperties(stored).nbr).toEqual({scale: 0.0001, offset: 0, unit: '1'})
    })
})

describe('storing an output with hundreds of bands', () => {
    // 24 measures expand to 293 bands, whose encoding exceeds what one property holds. The encodings are
    // fixtures for capacity only: CCDC Slice declares none.
    it('splits it into parts that each fit a property, and reads back the same facts', () => {
        const encoding = encodingOfBands(sliceShapedBands(24))

        const stored = encodingProperties(encoding)

        expect(bytes(JSON.stringify(encoding))).toBeGreaterThan(MAX_ASSET_PROPERTY_BYTES)
        expect(Object.values(stored).every(value => bytes(value) <= MAX_ASSET_PROPERTY_BYTES)).toBe(true)
        expect(encodingFromProperties(stored)).toEqual(encoding)
    })

    it('keeps the property count far below the number of bands', () => {
        const bands = sliceShapedBands(24)

        const stored = encodingProperties(encodingOfBands(bands))

        expect(bands).toHaveLength(293)
        expect(Object.keys(stored).length).toBeLessThanOrEqual(4)
        expect(JSON.parse(stored[ENCODING_PROPERTY]).parts).toBeGreaterThan(1)
    })

    it('is read in one request, from keys named without reading the asset first', () => {
        const stored = encodingProperties(encodingOfBands(sliceShapedBands(24)))

        expect(encodingPropertyKeys()).toHaveLength(MAX_ENCODING_PARTS + 1)
        expect(Object.keys(stored).every(key => encodingPropertyKeys().includes(key))).toBe(true)
    })
})

describe('the size of a stored part', () => {
    it('fills a property to exactly the limit without splitting', () => {
        const stored = encodingProperties(encodingOfExactly(MAX_ASSET_PROPERTY_BYTES))

        expect(bytes(stored.sepal_band_encoding_1)).toBe(16384)
        expect(JSON.parse(stored[ENCODING_PROPERTY]).parts).toBe(1)
    })

    it('splits at the first byte over the limit', () => {
        const stored = encodingProperties(encodingOfExactly(MAX_ASSET_PROPERTY_BYTES + 1))

        expect(JSON.parse(stored[ENCODING_PROPERTY]).parts).toBe(2)
        expect(Object.values(stored).every(value => bytes(value) <= MAX_ASSET_PROPERTY_BYTES)).toBe(true)
    })

    // Fewer characters than the limit allows, more bytes than it allows: a limit counted in characters would
    // keep this in one part, and lose it.
    it('measures multibyte content in bytes, not characters', () => {
        const encoding = multibyteEncoding()
        const value = JSON.stringify(encoding)
        expect(value.length).toBeLessThan(MAX_ASSET_PROPERTY_BYTES)
        expect(bytes(value)).toBeGreaterThan(MAX_ASSET_PROPERTY_BYTES)

        const stored = encodingProperties(encoding)

        expect(JSON.parse(stored[ENCODING_PROPERTY]).parts).toBeGreaterThan(1)
        expect(Object.values(stored).every(part => bytes(part) <= MAX_ASSET_PROPERTY_BYTES)).toBe(true)
        expect(encodingFromProperties(stored)).toEqual(encoding)
    })
})

describe('an encoding that cannot be represented', () => {
    it('refuses a single band whose entry exceeds a whole property, naming it, its size and the limit', () => {
        const name = `b${'x'.repeat(MAX_ASSET_PROPERTY_BYTES)}`

        const {message} = refusal(() => encodingProperties({[name]: REFLECTANCE}))

        expect(message).toContain(name)
        expect(message).toContain(String(MAX_ASSET_PROPERTY_BYTES))
        expect(Number(message.match(/(\d+) bytes/)[1])).toBeGreaterThan(MAX_ASSET_PROPERTY_BYTES)
    })

    it('refuses more parts than can be read back', () => {
        const encoding = {}
        for (let part = 0; part <= MAX_ENCODING_PARTS; part++) {
            Object.assign(encoding, prefixed(encodingOfExactly(MAX_ASSET_PROPERTY_BYTES), `p${part}_`))
        }

        expect(() => encodingProperties(encoding)).toThrow(/64 parts/)
    })
})

describe('an empty encoding', () => {
    it('is stored as an authoritative statement that nothing is known', () => {
        const stored = encodingProperties({})

        expect(stored).toEqual({[ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 0})})
        expect(encodingFromProperties(stored)).toEqual({})
    })

    it('leaves obsolete parts beside it unread', () => {
        const stored = {
            ...encodingProperties({}),
            sepal_band_encoding_1: JSON.stringify({red: THERMAL})
        }

        expect(encodingFromProperties(stored)).toEqual({})
    })
})

describe('reading what an earlier release stored', () => {
    it('reads a single version 1 property, as the assets in use hold it', () => {
        const stored = {[ENCODING_PROPERTY]: JSON.stringify({version: 1, bands: {red: REFLECTANCE}})}

        expect(encodingFromProperties(stored)).toEqual({red: {scale: 0.0001, offset: 0, unit: '1'}})
    })

    it('reads a version 1 property that states nothing as nothing known', () => {
        const stored = {[ENCODING_PROPERTY]: JSON.stringify({version: 1, bands: {}})}

        expect(encodingFromProperties(stored)).toEqual({})
    })

    it('ignores parts left beside a version 1 property', () => {
        const stored = {
            [ENCODING_PROPERTY]: JSON.stringify({version: 1, bands: {red: REFLECTANCE}}),
            sepal_band_encoding_1: JSON.stringify({thermal: THERMAL})
        }

        expect(encodingFromProperties(stored)).toEqual({red: REFLECTANCE})
    })
})

describe('reading an incomplete or unreadable representation', () => {
    const complete = () => encodingProperties({red: REFLECTANCE, thermal: THERMAL})

    it.each([
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
    ])('is unknown rather than partial when %s', (_case, damage) => {
        expect(encodingFromProperties(damage(complete()))).toEqual({})
    })

    it('withholds only the band whose entry is malformed, where the parts are all there', () => {
        const stored = encodingProperties({red: REFLECTANCE, thermal: THERMAL})
        const damaged = {
            ...stored,
            sepal_band_encoding_1: JSON.stringify({
                ...JSON.parse(stored.sepal_band_encoding_1),
                thermal: {scale: 0}
            })
        }

        expect(encodingFromProperties(damaged)).toEqual({red: REFLECTANCE})
    })
})

describe('comparing stored facts', () => {
    it('agrees across the representations that hold them, whatever the layout', () => {
        const facts = {red: REFLECTANCE, thermal: THERMAL}
        const chunked = encodingFromProperties(encodingProperties(facts))
        const legacy = encodingFromProperties({
            [ENCODING_PROPERTY]: JSON.stringify({version: 1, bands: {thermal: THERMAL, red: REFLECTANCE}})
        })

        expect(reconcileEncodings(chunked, legacy)).toBe(AGREED)
    })

    it('agrees where the same facts are split differently', () => {
        const facts = encodingOfBands(sliceShapedBands(24))
        const split = encodingFromProperties(encodingProperties(facts))

        expect(reconcileEncodings(split, facts)).toBe(AGREED)
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
