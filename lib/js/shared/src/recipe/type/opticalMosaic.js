import {isoDate, monthsBefore} from '../calendar.js'
import {reflectanceOf} from '../classifierInputs.js'
import {dataSetPeriodRequirement, periodOfDates} from '../dataSetAvailability.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {migrate} from '../migrate.js'
import {opticalBandEncoding} from '../optical/encoding.js'
import {selectableBands} from '../optical/opticalBands.js'
import {calendarDate} from '../output/dateFields.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, REFERENCE} from '../output/readiness.js'
import {AOI, fromAoi} from '../source/aoi.js'

// An optical mosaic composites a scene collection and clips it to its AOI
// (lib/js/ee/src/optical/mosaic.js). Its data sets are enumerated collection identifiers fixed in the
// implementation, not selections, so the AOI is its one external reference.

// An optical mosaic's own model states the collection it composited and the window it covers.
export const opticalCollectionDefaults = {
    defaultsAsset: () => null
}

// The days its composite reads (dateFilter, lib/js/ee/src/optical/collection.js): its season, in every year from
// `yearsBefore` before to `yearsAfter` after, as the days from the first season's start until the last one's end. That
// judges a data set as the seasons themselves do, as none holds imagery for less than the year between two of them.
// Under the correction it composites with. With selected scenes, these days constrain the search for scenes; the
// composite reads the scenes chosen by id, whatever the dates.
export const dataSetPeriod = model => {
    const {seasonStart, seasonEnd, yearsBefore = 0, yearsAfter = 0} = model?.dates || {}
    return periodOfDates(seasonStart, seasonEnd) && isCount(yearsBefore) && isCount(yearsAfter)
        ? periodOfDates(
            yearsLater(seasonStart, -yearsBefore),
            yearsLater(seasonEnd, yearsAfter),
            {reflectance: reflectanceOf(model?.compositeOptions)}
        )
        : null
}

// Composited from all scenes, its data sets must include one that may hold imagery in those years. Judged over the data
// sets as execution migrates an earlier form of them.
const PERIOD_COVERED = dataSetPeriodRequirement({
    period: model => allScenes(model) ? dataSetPeriod(model) : null,
    operations: [IMAGE_OUTPUT]
})

// Described from the model, not observed: indexes are computed only when requested, so the composite built for an
// empty selection does not list what is available. Migrated first, as execution migrates it.
export default defineRecipeType({
    type: 'MOSAIC',
    opticalCollectionDefaults,
    directSources: model => fromAoi({model, keys: ['aoi']}),
    executionNeeds: {[IMAGE_OUTPUT]: {[AOI]: REFERENCE}},
    configurationRequirements: [
        {...PERIOD_COVERED, findings: model => PERIOD_COVERED.findings(migrate({type: 'MOSAIC', model}).model)}
    ],
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => ({
            bands: selectableBands(migrate(recipe).model).map(name => {
                const encoding = opticalBandEncoding(name)
                return {
                    name,
                    dataType: {arrayDimensions: 0},
                    ...(encoding ? {encoding} : {})
                }
            }),
            evidence: []
        })
    })
})

const allScenes = model => !model?.sceneSelectionOptions || model.sceneSelectionOptions.type === 'ALL'

const isCount = value => Number.isInteger(value) && value >= 0

// The same day `years` later, or the last of its month where that month is shorter, as execution shifts a season.
const yearsLater = (value, years) => {
    const {date} = calendarDate(value)
    return isoDate(monthsBefore(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), -12 * years))
}
