import moment from 'moment'
import React from 'react'

import {hasMonitoringDates, monitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {SourceEvidenceSync} from '../sourceEvidenceSync'
import {getAvailableBands} from './bands'
import {defaultModel, RecipeActions} from './changeAlertsRecipe'
import {ChangeAlertsToolbar} from './panels/changeAlertsToolbar'
import {changeAlertsObservation} from './referenceObservation'
import {getPreSetVisualizations} from './visualizations'

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
                <SourceEvidenceSync observation={changeAlertsObservation}/>
            </Map>
        )
    }
}

const ChangeAlerts = compose(
    _ChangeAlerts,
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'CHANGE_ALERTS',
    labels: {
        name: msg('process.changeAlerts.create'),
        creationDescription: msg('process.changeAlerts.description'),
        tabPlaceholder: msg('process.changeAlerts.tabPlaceholder')
    },
    tags: ['CHANGE', 'ALERTS'],
    components: {
        recipe: ChangeAlerts
    },
    // The monitoring period, as instants its callers can take the value of. A recipe that states no period
    // has no range to offer.
    getDateRange(recipe) {
        if (!hasMonitoringDates(recipe.model)) {
            return null
        }
        const {monitoringEnd, monitoringStart} = monitoringDates(recipe.model)
        return [moment.utc(monitoringStart, 'YYYY-MM-DD'), moment.utc(monitoringEnd, 'YYYY-MM-DD')]
    },
    getAvailableBands,
    getPreSetVisualizations
})
