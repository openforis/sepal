import _ from 'lodash'

import {getDataSetOptions as opticalDataSetOptions} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {getDataSetOptions as planetDataSetOptions} from '~/app/home/body/process/recipe/planetMosaic/sources'
import {getDataSetOptions as radarDataSetOptions} from '~/app/home/body/process/recipe/radarMosaic/sources'
import {getAvailableBands} from '~/sources'

// The data Change Alerts monitors, chosen in Sources: a type, and data sets of that type. The bands it observes are
// what the mosaics of those data sets offer (~/sources).

export const MONITORING_TYPES = ['OPTICAL', 'RADAR', 'PLANET']

// The data sets Sources offers for a type, over the monitoring dates.
export const dataSetOptions = (type, dates = {}) => {
    switch (type) {
        case 'OPTICAL': return opticalDataSetOptions(dates)
        case 'RADAR': return radarDataSetOptions(dates)
        case 'PLANET': return planetDataSetOptions(dates)
        default: return []
    }
}

// The bands the monitoring data chosen observes, unknown before any is chosen.
export const observedMeasures = ({sources = {}, options = {}}) => {
    const dataSets = Object.values(sources.dataSets || {}).flat()
    return dataSets.length ? getAvailableBands({dataSets, corrections: options.corrections}) : null
}

// The bands a pixel chart's observations show: those the monitoring data chosen observes, none before any is chosen.
export const observedBands = recipe => observedMeasures(recipe.model) || []

// The bands some choice of data sets of a type observes: any one of them - choosing more only narrows what they
// observe together - top of atmosphere or corrected to surface reflectance. Unknown for no type.
export const availableMeasures = type => type ? measuresOfType(type) : null

// The bands some monitoring data Sources offers observes.
export const monitorableMeasures = () => _.uniq(MONITORING_TYPES.flatMap(type => measuresOfType(type)))

const REFLECTANCES = [[], ['SR']]

const measuresOfType = _.memoize(type => _.uniq(
    dataSetOptions(type).flatMap(({value: dataSet}) =>
        REFLECTANCES.flatMap(corrections => getAvailableBands({dataSets: [dataSet], corrections}))
    )
))
