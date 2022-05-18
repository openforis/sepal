import {Aoi} from '../aoi'
import {Map} from 'app/home/map/map'
import {RecipeActions} from './changeAlertsRecipe'
import {ReferenceSync} from './referenceSync'
import {compose} from 'compose'
import {defaultModel} from './changeAlertsRecipe'
import {getAvailableBands} from './bands'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import ChangeAlertsToolbar from './panels/changeAlertsToolbar'
import Notifications from 'widget/notifications'
import React from 'react'
import moment from 'moment'

const mapRecipeToProps = recipe => ({
    reference: selectFrom(recipe, 'model.reference'),
    classificationRecipeId: selectFrom(recipe, 'model.sources.classification'),
    classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
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

    componentDidMount() {
        this.initClassification()
    }

    componentDidUpdate() {
        this.initClassification()
    }

    initClassification() {
        const {stream, classificationLegend, classificationRecipeId, loadRecipe$} = this.props
        if (classificationRecipeId && !classificationLegend && !stream('LOAD_CLASSIFICATION_RECIPE').active) {
            stream('LOAD_CLASSIFICATION_RECIPE',
                loadRecipe$(classificationRecipeId),
                classification => {
                    this.recipeActions.setClassification({
                        classificationLegend: classification.model.legend,
                        classifierType: classification.model.classifier.type
                    })
                },
                error => Notifications.error({message: msg('process.timeSeries.panel.sources.classificationLoadError', {error}), error})
            )
        } else if (!classificationRecipeId && classificationLegend && !stream('LOAD_CLASSIFICATION_RECIPE').active) {
            this.recipeActions.setClassification({classificationLegend: null, classifierType: null})
        }
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
        const date = moment.utc(recipe.model.date.date, 'YYYY-MM-DD')
        return [date, date]
    },
    getAvailableBands
})
