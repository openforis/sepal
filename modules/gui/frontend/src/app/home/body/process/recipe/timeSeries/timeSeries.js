import {compose} from 'compose'
import {defaultModel} from './timeSeriesRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import TimeSeriesToolbar from './panels/timeSeriesToolbar'
import styles from './timeSeries.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi'),
})

class _TimeSeries extends React.Component {
    render() {
        const {recipeContext: {statePath}} = this.props
        return (
            <div className={styles.timeSeries}>
                <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={2}/>
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
        tabPlaceholder: msg('process.timeSeries.tabPlaceholder'),
    },
    components: {
        recipe: TimeSeries
    }
})
