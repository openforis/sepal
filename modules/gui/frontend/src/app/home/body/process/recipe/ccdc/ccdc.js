import {RecipeActions, defaultModel} from './ccdcRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import CCDCToolbar from './panels/ccdcToolbar'
import MapScale from 'app/home/map/mapScale'
import MapToolbar from 'app/home/map/mapToolbar'
import Notifications from 'widget/notifications'
import React from 'react'
import api from 'api'
import styles from './ccdc.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
    classificationRecipeId: selectFrom(recipe, 'model.sources.classification'),
    classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
})

class _CCDC extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeContext: {statePath}} = this.props
        return (
            <div className={styles.ccdc}>
                <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}/>
                <MapScale/>
                <CCDCToolbar/>
            </div>
        )
    }

    componentDidMount() {
        const {aoi, sepalMap, componentWillUnmount$} = this.props
        setAoiLayer({
            sepalMap,
            aoi,
            destroy$: componentWillUnmount$,
            onInitialized: () => sepalMap.fitLayer('aoi'),
            layerIndex: 1
        })
        this.initClassification()
    }

    componentDidUpdate() {
        this.initClassification()
    }

    initClassification() {
        const {stream, classificationLegend, classificationRecipeId} = this.props
        if (classificationRecipeId && !classificationLegend && !stream('LOAD_CLASSIFICATION_RECIPE').active) {
            stream('LOAD_CLASSIFICATION_RECIPE',
                api.recipe.load$(classificationRecipeId),
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
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'CCDC',
    labels: {
        name: msg('process.ccdc.create'),
        creationDescription: msg('process.ccdc.description'),
        tabPlaceholder: msg('process.ccdc.tabPlaceholder')
    },
    components: {
        recipe: CCDC
    }
})
