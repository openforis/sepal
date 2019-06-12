import {recipe} from 'app/home/body/process/recipeContext'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import {sepalMap} from 'app/home/map/map'
import MapToolbar from 'app/home/map/mapToolbar'
import {compose} from 'compose'
import React from 'react'
import {selectFrom} from 'stateUtils'
import {connect} from 'store'
import {msg} from 'translate'
import TimeSeriesToolbar from './panels/timeSeriesToolbar'
import styles from './timeSeries.module.css'
import {defaultModel} from './timeSeriesRecipe'

const mapStateToProps = state => {
    return {
        tabCount: selectFrom(state, 'process.tabs').length
    }
}
const mapRecipeToProps = recipe => ({
    recipeId: selectFrom(recipe, 'id'),
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
})

class _TimeSeries extends React.Component {
    render() {
        const {recipeId, recipePath} = this.props
        return (
            <div className={styles.timeSeries}>
                <MapToolbar statePath={recipePath + '.ui'} mapContext={recipeId} labelLayerIndex={1}/>
                <TimeSeriesToolbar/>
            </div>
        )
    }

    componentDidMount() {
        const {recipeId, aoi, tabCount, componentWillUnmount$} = this.props
        setAoiLayer({
            contextId: recipeId,
            aoi,
            destroy$: componentWillUnmount$,
            onInitialized: () => {
                if (tabCount === 1) {
                    sepalMap.setContext(recipeId)
                    sepalMap.getContext(recipeId).fitLayer('aoi')
                }
            }
        })
    }
}

const TimeSeries = compose(
    _TimeSeries,
    connect(mapStateToProps),
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
