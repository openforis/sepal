import {msg} from '~/translate'
import _ from 'lodash'

export const getDataSetOptions = () => {
    return [
        {value: 'NICFI', label: msg('process.planetMosaic.panel.sources.form.collectionTypes.NICFI.label'), tooltip: msg('process.planetMosaic.panel.sources.form.collectionTypes.NICFI.tooltip')},
        {value: 'BASEMAPS', label: msg('process.planetMosaic.panel.sources.form.collectionTypes.BASEMAPS.label'), tooltip: msg('process.planetMosaic.panel.sources.form.collectionTypes.BASEMAPS.tooltip')},
        {value: 'DAILY', label: msg('process.planetMosaic.panel.sources.form.collectionTypes.DAILY.label'), tooltip: msg('process.planetMosaic.panel.sources.form.collectionTypes.DAILY.tooltip')}
    ]
}

const DATA_SET_IDS = ['NICFI', 'BASEMAPS', 'DAILY']

export const toSources = dataSetIds =>
    _.intersection(dataSetIds, DATA_SET_IDS).length
        ? {PLANET: dataSetIds.filter(dataSetId => DATA_SET_IDS.includes(dataSetId))}
        : {}
