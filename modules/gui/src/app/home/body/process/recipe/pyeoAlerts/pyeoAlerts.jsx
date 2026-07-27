import moment from 'moment'
import React from 'react'

import {initializeLayers} from '~/app/home/body/process/recipe/recipeImageLayerSource'
import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {getAvailableBands} from './bands'
import {PyeoAlertsToolbar} from './panels/pyeoAlertsToolbar'
import {defaultModel} from './pyeoAlertsRecipe'
import {getPreSetVisualizations} from './visualizations'

const DATE_FORMAT = 'YYYY-MM-DD'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _PyeoAlerts extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <PyeoAlertsToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }
}

const PyeoAlerts = compose(
    _PyeoAlerts,
    recipe({defaultModel, mapRecipeToProps})
)

const getDateRange = recipe => {
    const {monitoringStart, monitoringEnd} = selectFrom(recipe, 'model.dates') || {}
    return [
        moment.utc(monitoringStart || moment().startOf('year').format(DATE_FORMAT), DATE_FORMAT),
        moment.utc(monitoringEnd || moment().format(DATE_FORMAT), DATE_FORMAT)
    ]
}

const getDependentRecipeIds = recipe => {
    const classificationId = selectFrom(recipe, 'model.sources.classification')
    return classificationId ? [classificationId] : []
}

export default () => ({
    id: 'PYEO_ALERTS',
    labels: {
        name: msg('process.pyeoAlerts.create'),
        creationDescription: msg('process.pyeoAlerts.description'),
        tabPlaceholder: msg('process.pyeoAlerts.tabPlaceholder')
    },
    tags: ['CHANGE', 'ALERTS'],
    components: {
        recipe: PyeoAlerts
    },
    getDependentRecipeIds,
    getDateRange,
    getAvailableBands,
    getPreSetVisualizations
})
