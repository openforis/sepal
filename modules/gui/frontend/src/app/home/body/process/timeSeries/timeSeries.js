import {RecipeState, recipePath} from './timeSeriesRecipe'
import {connect, select} from 'store'
import {recipe} from 'app/home/body/process/recipe'
import {sepalMap} from 'app/home/map/map'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import MapToolbar from 'app/home/map/mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'
import TimeSeriesToolbar from './panels/timeSeriesToolbar'
import styles from './timeSeries.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = ownProps.recipeState
    return {
        initialized: recipeState('ui.initialized'),
        aoi: recipeState('model.aoi'),
        tabCount: select('process.tabs').length
    }
}

class TimeSeries extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <div className={styles.timeSeries}>
                <MapToolbar statePath={recipePath(recipeId, 'ui')} mapContext={recipeId} labelLayerIndex={1}/>
                <TimeSeriesToolbar recipeId={recipeId} className={styles.timeSeriesToolbar}/>
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

TimeSeries.propTypes = {
    recipeId: PropTypes.string.isRequired,
    aoi: PropTypes.object
}

export default recipe(RecipeState)(
    connect(mapStateToProps)(TimeSeries)
)
