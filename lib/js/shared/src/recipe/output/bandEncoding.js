// Per-band numeric encoding: `physical = stored * scale + offset`, in `unit` where established. Absent is unknown.
//
// Stored as a manifest naming as many parts as the dictionary needs, each within one asset property's limit:
//
//   sepal_band_encoding    {"version":2,"parts":2}
//   sepal_band_encoding_1  {"red":{"scale":0.0001,"offset":0,"unit":"1"},...}
//   sepal_band_encoding_2  {...}
//
// The manifest alone says what the value is. Version 1, which held the whole dictionary inline, is still read.
// See docs/design/recipes/data-sources.md#band-encoding.

import {assetPropertyBytes, MAX_ASSET_PROPERTY_BYTES} from '../../earthEngineAssetProperties.js'

export const ENCODING_PROPERTY = 'sepal_band_encoding'

export const ENCODING_VERSION = 2

// Enough for some 13,000 bands. A write that needs more parts fails rather than storing what cannot be read back.
export const MAX_ENCODING_PARTS = 64

export const AGREED = 'AGREED'
export const CONFLICTING = 'CONFLICTING'
export const INCOMPLETE = 'INCOMPLETE'

// A zero scale would map every stored value to the same physical value.
export const isValidEncoding = encoding =>
    isPlainObject(encoding)
    && isFiniteNumber(encoding.scale)
    && encoding.scale !== 0
    && (encoding.offset === undefined || isFiniteNumber(encoding.offset))
    && (encoding.unit === undefined || (typeof encoding.unit === 'string' && encoding.unit.trim().length > 0))

// An omitted offset is zero; an omitted unit stays unknown.
export const normalizedEncoding = encoding =>
    isValidEncoding(encoding)
        ? {
            scale: encoding.scale,
            offset: encoding.offset === undefined ? 0 : encoding.offset,
            ...(encoding.unit === undefined ? {} : {unit: encoding.unit})
        }
        : undefined

// What the bands of an output establish, as the facts alone.
export const encodingOfBands = bands => Object.fromEntries(
    (bands || [])
        .filter(({encoding}) => isValidEncoding(encoding))
        .map(({name, encoding}) => [name, normalizedEncoding(encoding)])
)

// The properties stating this encoding, in full. An empty encoding is stated explicitly: it is the export's own
// answer that nothing is known, and it has to overrule whatever the asset carried before.
export const encodingProperties = encodingByBand => {
    const parts = encodingParts(encodingByBand)
    if (parts.length > MAX_ENCODING_PARTS) {
        throw new Error(
            `Band encoding needs ${parts.length} parts, over the limit of ${MAX_ENCODING_PARTS} parts`
        )
    }
    return {
        [ENCODING_PROPERTY]: JSON.stringify({version: ENCODING_VERSION, parts: parts.length}),
        ...Object.fromEntries(parts.map((part, index) => [partProperty(index + 1), part]))
    }
}

// Properties with every trace of a stored encoding removed, so nothing of an earlier or inherited representation
// survives beside the one being written.
export const withoutEncodingProperties = properties =>
    Object.fromEntries(Object.entries(properties || {}).filter(([key]) => !isEncodingProperty(key)))

// Each encoding property an image already carries that the stated one does not replace, mapped to null so it is
// removed rather than left behind. Setting properties on an image replaces the ones named and keeps the rest, so
// an obsolete part survives unless it is named.
export const clearedEncodingProperties = (carriedKeys, statedProperties) =>
    Object.fromEntries((carriedKeys || [])
        .filter(key => isEncodingProperty(key) && !(key in (statedProperties || {})))
        .map(key => [key, null]))

// Every property a complete encoding can occupy, named without reading the asset first.
export const encodingPropertyKeys = () => [
    ENCODING_PROPERTY,
    ...Array.from({length: MAX_ENCODING_PARTS}, (_value, index) => partProperty(index + 1))
]

export const encodingFromProperties = properties => {
    const manifest = parse(properties?.[ENCODING_PROPERTY])
    if (!isPlainObject(manifest)) {
        return {}
    }
    if (manifest.version === LEGACY_INLINE_VERSION) {
        return statedEncodings(manifest.bands)
    }
    if (manifest.version !== ENCODING_VERSION) {
        return {}
    }
    const parts = statedParts(manifest.parts, properties)
    return parts ? statedEncodings(Object.assign({}, ...parts)) : {}
}

export const bandsWithEncoding = (bands, properties) => {
    const encodingByBand = encodingsByBand(encodingFromProperties(properties))
    return (bands || []).map(band => encodingByBand.has(band.name)
        ? {...band, encoding: encodingByBand.get(band.name)}
        : band
    )
}

// CONFLICTING when any fact is established differently on the two sides, AGREED when every band is
// established identically on both, and otherwise INCOMPLETE - a band, or a band's unit, stated on one side only.
export const reconcileEncodings = (proposedByBand, persistedByBand) => {
    const proposed = encodingsByBand(proposedByBand)
    const persisted = encodingsByBand(persistedByBand)
    const outcomes = [...new Set([...proposed.keys(), ...persisted.keys()])]
        .map(name => reconcileBand(proposed.get(name), persisted.get(name)))
    return outcomes.includes(CONFLICTING) ? CONFLICTING
        : outcomes.every(outcome => outcome === AGREED) ? AGREED
            : INCOMPLETE
}

// Version 1 wrote the whole dictionary into ENCODING_PROPERTY. Read, never written.
const LEGACY_INLINE_VERSION = 1

const partProperty = part => `${ENCODING_PROPERTY}_${part}`

const isEncodingProperty = key =>
    key === ENCODING_PROPERTY || new RegExp(`^${ENCODING_PROPERTY}_\\d+$`).test(key)

// Packed greedily: a part takes bands until the next one would not fit, which keeps the parts few without
// making where a band lands mean anything.
const encodingParts = encodingByBand => {
    const parts = []
    let current = {}
    Object.entries(encodingByBand || {})
        .filter(([_name, encoding]) => isValidEncoding(encoding))
        .forEach(([name, encoding]) => {
            const candidate = {...current, [name]: normalizedEncoding(encoding)}
            if (fitsProperty(candidate)) {
                current = candidate
                return
            }
            if (Object.keys(current).length) {
                parts.push(JSON.stringify(current))
            }
            current = {[name]: normalizedEncoding(encoding)}
            if (!fitsProperty(current)) {
                throw new Error(
                    `Band encoding for "${name}" does not fit an asset property: `
                    + `${assetPropertyBytes(JSON.stringify(current))} bytes, limit ${MAX_ASSET_PROPERTY_BYTES}`
                )
            }
        })
    if (Object.keys(current).length) {
        parts.push(JSON.stringify(current))
    }
    return parts
}

const fitsProperty = part => assetPropertyBytes(JSON.stringify(part)) <= MAX_ASSET_PROPERTY_BYTES

// Every part the manifest names, or nothing: one unreadable part makes the whole value unknown.
const statedParts = (count, properties) => {
    if (!Number.isInteger(count) || count < 0 || count > MAX_ENCODING_PARTS) {
        return null
    }
    const parts = []
    for (let part = 1; part <= count; part++) {
        const parsed = parse(properties?.[partProperty(part)])
        if (!isPlainObject(parsed)) {
            return null
        }
        parts.push(parsed)
    }
    return parts
}

// A malformed entry withholds only its own band, wherever the representation itself is complete.
const statedEncodings = bands => isPlainObject(bands)
    ? Object.fromEntries(
        Object.entries(bands)
            .map(([name, encoding]) => [name, normalizedEncoding(encoding)])
            .filter(([_name, encoding]) => encoding)
    )
    : {}

const reconcileBand = (proposed, persisted) => {
    const left = normalizedEncoding(proposed)
    const right = normalizedEncoding(persisted)
    if (!left || !right) {
        return INCOMPLETE
    }
    if (left.scale !== right.scale || left.offset !== right.offset) {
        return CONFLICTING
    }
    if (left.unit === right.unit) {
        return AGREED
    }
    return left.unit === undefined || right.unit === undefined ? INCOMPLETE : CONFLICTING
}

// Band names are data: a plain-object lookup would find `constructor` or `toString` on every object.
const encodingsByBand = encodings => new Map(Object.entries(encodings || {}))

const isPlainObject = value =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value)

const parse = value => {
    try {
        return JSON.parse(value)
    } catch (_error) {
        return null
    }
}
