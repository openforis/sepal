import moment from 'moment'
import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {getAvailableBands} from './bands'
import {defaultModel, RecipeActions} from './baytsAlertsRecipe'
import {BaytsAlertsToolbar} from './panels/baytsAlertsToolbar'
import {ReferenceSync} from './referenceSync'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    reference: selectFrom(recipe, 'model.reference'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _BaytsAlerts extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {reference} = this.props
        return (
            <Map>
                <BaytsAlertsToolbar/>
                <Aoi value={reference.type && reference}/>
                <ReferenceSync/>
            </Map>
        )
    }
}

const BaytsAlerts = compose(
    _BaytsAlerts,
    recipe({defaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe => {
    const {type, id} = selectFrom(recipe, 'model.reference') || {}
    return type === 'RECIPE_REF' ? [id] : []
}

export default () => ({
    id: 'BAYTS_ALERTS',
    labels: {
        name: msg('process.baytsAlerts.create'),
        creationDescription: msg('process.baytsAlerts.description'),
        tabPlaceholder: msg('process.baytsAlerts.tabPlaceholder')
    },
    tags: ['CHANGE', 'ALERTS'],
    components: {
        recipe: BaytsAlerts
    },
    getDependentRecipeIds,
    getDateRange(recipe) {
        const monitoringEnd = moment.utc(recipe.model.date.monitoringEnd, 'YYYY-MM-DD')
        const monitoringStart = moment(monitoringEnd)
            .subtract(recipe.model.date.monitoringDuration, recipe.model.date.monitoringDurationUnit)
        return [monitoringStart, monitoringEnd]
    },
    getAvailableBands,
    getPreSetVisualizations,
    beta: true
})
