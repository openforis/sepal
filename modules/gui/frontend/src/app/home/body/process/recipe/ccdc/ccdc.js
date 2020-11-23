import {RecipeActions, defaultModel} from './ccdcRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import CCDCToolbar from './panels/ccdcToolbar'
import ChartPixel from './panels/chartPixel'
import ChartPixelButton from './panels/chartPixelButton'
import MapScale from 'app/home/map/mapScale'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import styles from './ccdc.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi')
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
                <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}>
                    <ChartPixelButton
                        showGoogleSatellite
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}/>
                </MapToolbar>
                <MapScale/>
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

    setChartPixel(latLng) {
        this.recipeActions.setChartPixel(latLng)
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
    },
    beta: true
})
