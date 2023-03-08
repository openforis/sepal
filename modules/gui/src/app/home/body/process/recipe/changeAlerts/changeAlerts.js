import {Aoi} from '../aoi'
import {Map} from 'app/home/map/map'
import {RecipeActions, defaultModel} from './changeAlertsRecipe'
import {ReferenceSync} from './referenceSync'
import {compose} from 'compose'
import {getAvailableBands} from './bands'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import ChangeAlertsToolbar from './panels/changeAlertsToolbar'
import React from 'react'
import moment from 'moment'

const mapRecipeToProps = recipe => ({
    reference: selectFrom(recipe, 'model.reference'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _ChangeAlerts extends React.Component {
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
                <ChangeAlertsToolbar/>
                <Aoi value={reference.type && reference}/>
                <ReferenceSync/>
            </Map>
        )
    }
}

const ChangeAlerts = compose(
    _ChangeAlerts,
    recipe({defaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe => {
    const {type, id} = selectFrom(recipe, 'model.reference') || {}
    return type === 'RECIPE_REF' ? [id] : []
}

export default () => ({
    id: 'CHANGE_ALERTS',
    labels: {
        name: msg('process.changeAlerts.create'),
        creationDescription: msg('process.changeAlerts.description'),
        tabPlaceholder: msg('process.changeAlerts.tabPlaceholder')
    },
    components: {
        recipe: ChangeAlerts
    },
    getDependentRecipeIds,
    getDateRange(recipe) {
        const monitoringEnd = moment.utc(recipe.model.date.monitoringEnd, 'YYYY-MM-DD')
        const monitoringStart = moment(monitoringEnd)
            .subtract(recipe.model.date.monitoringDuration, recipe.model.date.monitoringDurationUnit)
        return [monitoringStart, monitoringEnd]
    },
    getAvailableBands
})
