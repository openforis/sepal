// The mosaic a Change Alerts recipe monitors against, for one period and mosaic type. Earth Engine builds it
// to execute, and the GUI builds it to say which bands and visualizations that mosaic offers, so both read one
// projection.
//
// Pure, and free of Earth Engine: the AOI an executor clips to is passed in, never computed here.

import {monitoringDates} from './monitoringDates.js'

const MONITORING = 'monitoring'
const LATEST = 'latest'

// Null for a data-set type no mosaic is defined for, which a consumer answers for in its own terms.
export const mosaicRecipe = ({model, period, mosaicType, aoi}) => {
    const mosaic = {
        OPTICAL: opticalMosaic,
        RADAR: radarMosaic,
        PLANET: planetMosaic
    }[model.sources.dataSetType]
    return mosaic
        ? mosaic({model, dates: monitoringDates(model), period, mosaicType, aoi})
        : null
}

// The optical mosaic composites the whole period rather than picking one scene, so the mosaic type reaches it
// as the day-of-year percentile rather than as a target date.
const opticalMosaic = ({model, dates, period, mosaicType, aoi}) => {
    const {monitoringEnd, monitoringStart, calibrationStart} = dates
    const monitoring = period === MONITORING
    return {
        type: 'MOSAIC',
        model: {
            aoi,
            dates: {
                targetDate: monitoring ? monitoringEnd : monitoringStart,
                seasonStart: monitoring ? monitoringStart : calibrationStart,
                seasonEnd: monitoring ? monitoringEnd : monitoringStart,
                yearsBefore: 0,
                yearsAfter: 0
            },
            sources: model.sources,
            sceneSelectionOptions: {
                type: 'ALL'
            },
            compositeOptions: {
                ...model.options,
                filters: [
                    {type: 'DAY_OF_YEAR', percentile: mosaicType === LATEST ? 100 : 0}
                ],
                compose: 'MEDIAN'
            }
        }
    }
}

// A latest radar mosaic is a point in time, and any other is a scan of the period - a different schema, which
// is why the GUI has to read this projection rather than the recipe's own dates.
const radarMosaic = ({model, dates, period, mosaicType, aoi}) => {
    const {monitoringEnd, monitoringStart, calibrationStart} = dates
    const monitoring = period === MONITORING
    const latest = mosaicType === LATEST
    return {
        type: 'RADAR_MOSAIC',
        model: {
            aoi,
            dates: {
                targetDate: latest
                    ? monitoring ? monitoringEnd : monitoringStart
                    : undefined,
                fromDate: latest
                    ? undefined
                    : monitoring ? monitoringStart : calibrationStart,
                toDate: latest
                    ? undefined
                    : monitoring ? monitoringEnd : monitoringStart
            },
            options: {
                ...model.options
            }
        }
    }
}

// Planet keeps the period alongside a target date, because its mosaic selects within the interval it is given.
const planetMosaic = ({model, dates, period, mosaicType, aoi}) => {
    const {monitoringEnd, monitoringStart, calibrationStart} = dates
    const monitoring = period === MONITORING
    return {
        type: 'PLANET_MOSAIC',
        model: {
            aoi,
            dates: {
                targetDate: mosaicType === LATEST
                    ? monitoring ? monitoringEnd : monitoringStart
                    : undefined,
                fromDate: monitoring ? monitoringStart : calibrationStart,
                toDate: monitoring ? monitoringEnd : monitoringStart
            },
            sources: {
                source: model.sources.dataSets.PLANET[0],
                assets: model.sources.assets
            },
            options: {
                ...model.options
            }
        }
    }
}
