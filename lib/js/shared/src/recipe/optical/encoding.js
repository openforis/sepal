import {REQUIRED_BANDS_BY_INDEX, TASSELED_CAP_BANDS} from './opticalBands.js'

// The optical composer stores every composited band at this many per unit of the quantity normalization left it
// in. The multiplier is shared but the encoding is not: thermal is normalized to kilokelvin, so its scale in kelvin
// is a thousand times reflectance's.
export const OPTICAL_STORED_PER_UNIT = 10000

const REFLECTANCE = {unitFactor: 1, unit: '1'}
const KILOKELVIN = {unitFactor: 1000, unit: 'K'}

const REFLECTANCE_BANDS = [
    'aerosol', 'blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'pan', 'cirrus',
    'redEdge1', 'redEdge2', 'redEdge3', 'redEdge4', 'waterVapor'
]

const THERMAL_BANDS = ['thermal', 'thermal2']

// Bands added after storing, such as the date bands, and the native `qa` bitmask are absent: unknown.
const NORMALIZED_QUANTITY = new Map([
    ...REFLECTANCE_BANDS.map(band => [band, REFLECTANCE]),
    ...THERMAL_BANDS.map(band => [band, KILOKELVIN]),
    ...TASSELED_CAP_BANDS.map(band => [band, REFLECTANCE]),
    ...Object.keys(REQUIRED_BANDS_BY_INDEX).map(band => [band, REFLECTANCE])
])

export const opticalBandEncoding = name => {
    const quantity = NORMALIZED_QUANTITY.get(name)
    return quantity
        ? {scale: quantity.unitFactor / OPTICAL_STORED_PER_UNIT, offset: 0, unit: quantity.unit}
        : undefined
}
