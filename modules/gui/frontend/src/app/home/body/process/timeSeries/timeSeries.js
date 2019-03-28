import {connect} from 'store'
import {defaultModel} from './timeSeriesRecipe'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {sepalMap} from 'app/home/map/map'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import MapToolbar from 'app/home/map/mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'
import TimeSeriesToolbar from './panels/timeSeriesToolbar'
import styles from './timeSeries.module.css'

const mapStateToProps = state=> {
    return {
        tabCount: selectFrom(state, 'process.tabs').length
    }
}
const mapRecipeToProps = recipe => ({
    recipeId: selectFrom(recipe, 'id'),
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
})

class TimeSeries extends React.Component {
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

TimeSeries.propTypes = {
    recipeId: PropTypes.string.isRequired,
    aoi: PropTypes.object
}

export default (
    recipe({defaultModel, mapRecipeToProps})(
        connect(mapStateToProps)(
            TimeSeries
        )
    )
)
