import {RecipeActions} from './timeSeriesRecipe'
import {compose} from 'compose'
import {defaultModel} from './timeSeriesRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import MapScale from 'app/home/map/mapScale'
import MapToolbar from 'app/home/map/mapToolbar'
import Notifications from 'widget/notifications'
import React from 'react'
import TimeSeriesToolbar from './panels/timeSeriesToolbar'
import api from 'api'
import styles from './timeSeries.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
    classificationLegend: selectFrom(recipe, 'ui.classificationLegend'),
    classificationRecipeId: selectFrom(recipe, 'model.sources.classification')
})

class _TimeSeries extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeContext: {statePath}} = this.props
        return (
            <div className={styles.timeSeries}>
                <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={2}/>
                <MapScale/>
                <TimeSeriesToolbar/>
            </div>
        )
    }

    componentDidMount() {
        const {mapContext, aoi, componentWillUnmount$} = this.props
        setAoiLayer({
            mapContext,
            aoi,
            destroy$: componentWillUnmount$,
            onInitialized: () => mapContext.sepalMap.fitLayer('aoi'),
            layerIndex: 1
        })
        this.initClassificationLegend()
    }

    initClassificationLegend() {
        const {stream, classificationLegend, classificationRecipeId} = this.props
        if (classificationRecipeId && !classificationLegend) {
            stream('LOAD_CLASSIFICATION_RECIPE',
                api.recipe.load$(classificationRecipeId),
                classification => this.recipeActions.setClassificationLegend(classification.model.legend),
                error => Notifications.error({message: msg('process.ccdc.panel.sources.classificationLoadError', {error}), error})
            )
        }
    }
}

const TimeSeries = compose(
    _TimeSeries,
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'TIME_SERIES',
    labels: {
        name: msg('process.timeSeries.create'),
        creationDescription: msg('process.timeSeries.description'),
        tabPlaceholder: msg('process.timeSeries.tabPlaceholder')
    },
    components: {
        recipe: TimeSeries
    }
})
