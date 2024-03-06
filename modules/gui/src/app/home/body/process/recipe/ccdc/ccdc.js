import {Aoi} from 'app/home/body/process/recipe/aoi'
import {CcdcToolbar} from './panels/ccdcToolbar'
import {Map} from 'app/home/map/map'
import {Notifications} from 'widget/notifications'
import {RecipeActions, dateRange, defaultModel} from './ccdcRecipe'
import {compose} from 'compose'
import {initializeLayers} from 'app/home/body/process/recipe/recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {recipeAccess} from 'app/home/body/process/recipeAccess'
import {selectFrom} from 'stateUtils'
import React from 'react'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers'),
    classificationRecipeId: selectFrom(recipe, 'model.sources.classification'),
    classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
})

class _CCDC extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        initializeLayers({recipeId, savedLayers, skipThis: true})
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <CcdcToolbar/>
                <Aoi value={aoi}/>
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
                error => Notifications.error({message: msg('process.ccdc.panel.sources.classificationLoadError', {error}), error})
            )
        } else if (!classificationRecipeId && classificationLegend && !stream('LOAD_CLASSIFICATION_RECIPE').active) {
            this.recipeActions.setClassification({classificationLegend: null, classifierType: null})
        }
    }
}

const CCDC = compose(
    _CCDC,
    recipe({defaultModel, mapRecipeToProps}),
    recipeAccess()
)

const getDependentRecipeIds = recipe => {
    const classification = selectFrom(recipe, 'model.sources.classification')
    return classification ? [classification] : []
}

export default () => ({
    id: 'CCDC',
    labels: {
        name: msg('process.ccdc.create'),
        creationDescription: msg('process.ccdc.description'),
        tabPlaceholder: msg('process.ccdc.tabPlaceholder')
    },
    tags: ['TIME_SERIES'],
    components: {
        recipe: CCDC
    },
    noImageOutput: true,
    getDependentRecipeIds,
    getDateRange: recipe => dateRange(recipe.model.dates)
})
