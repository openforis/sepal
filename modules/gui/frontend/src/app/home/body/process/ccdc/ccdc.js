import {compose} from 'compose'
import {connect} from 'store'
import {defaultModel} from './ccdcRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {sepalMap} from 'app/home/map/map'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import CCDCToolbar from './panels/ccdcToolbar'
import styles from './ccdc.module.css'
import ChartPixelButton from './panels/chartPixelButton'
import ChartPixel from './panels/chartPixel'

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

class _CCDC extends React.Component {
    render() {
        const {recipeId, recipeContext: {statePath}} = this.props
        return (
            <div className={styles.ccdc}>
                <MapToolbar statePath={[statePath, 'ui']} mapContext={recipeId} labelLayerIndex={3}>
                    <ChartPixelButton/>
                </MapToolbar>
                <CCDCToolbar/>
                <ChartPixel/>
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
            },
            layerIndex: 1
        })
    }
}

const CCDC = compose(
    _CCDC,
    connect(mapStateToProps),
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'CCDC',
    labels: {
        name: msg('process.ccdc.create'),
        creationDescription: msg('process.ccdc.description'),
        tabPlaceholder: msg('process.ccdc.tabPlaceholder'),
    },
    components: {
        recipe: CCDC
    },
    beta: true
})
