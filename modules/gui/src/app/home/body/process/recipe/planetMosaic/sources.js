import _ from 'lodash'

import {PLANET_SOURCES} from '#sepal/recipe/type/planetMosaic'
import {msg} from '~/translate'

export const getDataSetOptions = () => {
    return [
        {value: 'NICFI', label: msg('process.planetMosaic.panel.sources.form.collectionTypes.NICFI.label'), tooltip: msg('process.planetMosaic.panel.sources.form.collectionTypes.NICFI.tooltip')},
        {value: 'BASEMAPS', label: msg('process.planetMosaic.panel.sources.form.collectionTypes.BASEMAPS.label'), tooltip: msg('process.planetMosaic.panel.sources.form.collectionTypes.BASEMAPS.tooltip')},
        {value: 'DAILY', label: msg('process.planetMosaic.panel.sources.form.collectionTypes.DAILY.label'), tooltip: msg('process.planetMosaic.panel.sources.form.collectionTypes.DAILY.tooltip')}
    ]
}

export const toSources = dataSetIds =>
    _.intersection(dataSetIds, PLANET_SOURCES).length
        ? {PLANET: dataSetIds.filter(dataSetId => PLANET_SOURCES.includes(dataSetId))}
        : {}
