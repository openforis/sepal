import {compose} from 'compose'
import {defaultModel} from './ccdcRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import CCDCToolbar from './panels/ccdcToolbar'
import ChartPixel from './panels/chartPixel'
import ChartPixelButton from './panels/chartPixelButton'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import styles from './ccdc.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
})

class _CCDC extends React.Component {
    render() {
        const {recipeContext: {statePath}} = this.props
        return (
            <div className={styles.ccdc}>
                <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}>
                    <ChartPixelButton/>
                </MapToolbar>
                <CCDCToolbar/>
                <ChartPixel/>
            </div>
        )
    }

    componentDidMount() {
        const {aoi, mapContext, componentWillUnmount$} = this.props
        setAoiLayer({
            mapContext,
            aoi,
            destroy$: componentWillUnmount$,
            onInitialized: () => mapContext.sepalMap.fitLayer('aoi'),
            layerIndex: 1
        })
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
        tabPlaceholder: msg('process.ccdc.tabPlaceholder'),
    },
    components: {
        recipe: CCDC
    },
    beta: true
})
