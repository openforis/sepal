import {Aoi} from '../aoi'
import {BaytsAlertsToolbar} from './panels/baytsAlertsToolbar'
import {Map} from '~/app/home/map/map'
import {RecipeActions, defaultModel} from './baytsAlertsRecipe'
import {ReferenceSync} from './referenceSync'
import {compose} from '~/compose'
import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from '~/translate'
import {recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import React from 'react'
import moment from 'moment'

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
