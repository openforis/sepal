import {map} from 'rxjs'

import ee from '#sepal/ee/ee'
import {createReference, histogramMatch} from '#sepal/ee/histogramMatch'
import {
    DAILY_4_BAND_NAMES,
    DAILY_8_BAND_NAMES,
    PLANET_DAILY_4_BANDS,
    PLANET_DAILY_8_BANDS
} from '#sepal/recipe/planet/planetBands'

const QA_BANDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']

// The schemas this branch recognises. Imagery matching none of them contributes nothing, whichever asset it
// sits in.
const UDM1_SCHEMA = [...PLANET_DAILY_4_BANDS, 'udm1']
const UDM2_SCHEMA = [...PLANET_DAILY_4_BANDS, ...QA_BANDS]
const PSB_SD_SCHEMA = [...PLANET_DAILY_8_BANDS, ...QA_BANDS]

const histogramMatchCollection = ({collection, geometry, startDate, endDate}) => {
    const reference = createReference(startDate, endDate, geometry)
    return collection.map(image => {
        return histogramMatch(image.int16(), reference, 100, 100)
            .set('system:time_start', image.date().millis())
    })
}

const processDailyCollection = ({collection, geometry, startDate, endDate, histogramMatching}) => {
    const mask = function (image) {
        const qa = image.select(
            ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'],
            ['clear', 'snow', 'shadow', 'lightHaze', 'heavyHaze', 'cloud', 'confidence']
        )
        const mask = qa.select('clear')
            .and(qa.select('snow').not())
            .and(qa.select('shadow').not())
            .and(qa.select('lightHaze').not())
            .and(qa.select('heavyHaze').not())
            .and(qa.select('cloud').not())
            .and(qa.select('confidence')) // Actually between 0 and 100, but I'll mask out pixels with no confidence
        return image.updateMask(mask)
    }
    const udm1Collection = collection
        .filter(carrying(UDM1_SCHEMA))
        .map(function (image) {
            const mask = image.select('udm1').not()
            return image.updateMask(mask)
        })
        .select(PLANET_DAILY_4_BANDS, DAILY_4_BAND_NAMES)

    const udm2Collection = collection
        .filter(carrying(UDM2_SCHEMA))
        .map(mask)
        .select(PLANET_DAILY_4_BANDS, DAILY_4_BAND_NAMES)

    const psbSdCollection = collection
        .filter(carrying(PSB_SD_SCHEMA))
        .map(mask)
        .select(PLANET_DAILY_8_BANDS, DAILY_8_BAND_NAMES)

    const processedCollection = udm1Collection
        .merge(udm2Collection)
        .merge(psbSdCollection)
    return histogramMatching === 'ENABLED'
        ? histogramMatchCollection({
            collection: processedCollection,
            geometry,
            startDate,
            endDate
        })
        : processedCollection
}

// The native band names every contributing image carries, for a caller that must state what this branch makes
// available without processing the collection. Merging branches is not a union: a branch no imagery matched
// contributes nothing, so four-band imagery beside eight-band imagery still carries four. When no branch
// matches anything, the collection carries nothing rather than the four it would have carried had there been
// imagery.
//
// A collection that cannot be read has an unknown schema, and the failure is left to reach the caller. Falling
// back to the four every Daily image carries would replace a known catalogue with a narrower one no evidence
// supports.
export const contributingDailyBands$ = collection => ee.getInfo$(
    ee.Dictionary({
        fourBand: contributes(collection, [UDM1_SCHEMA, UDM2_SCHEMA]),
        eightBand: contributes(collection, [PSB_SD_SCHEMA])
    }),
    'Planet Daily band schemas'
).pipe(
    map(({fourBand, eightBand}) => {
        if (!fourBand && !eightBand) {
            return []
        }
        return eightBand && !fourBand
            ? PLANET_DAILY_8_BANDS
            : PLANET_DAILY_4_BANDS
    })
)

const carrying = schema => ee.Filter.eq('system:band_names', schema)

// Whether any image matches, rather than how many do.
const contributes = (collection, schemas) => collection
    .filter(ee.Filter.or(...schemas.map(carrying)))
    .limit(1)
    .size()
    .gt(0)

export {processDailyCollection}
