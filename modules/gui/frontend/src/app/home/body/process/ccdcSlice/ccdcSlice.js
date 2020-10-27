import {compose} from 'compose'
import {connect} from 'store'
import {defaultModel, RecipeActions} from './ccdcSliceRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {sepalMap} from 'app/home/map/map'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import CCDCSliceToolbar from './panels/ccdcSliceToolbar'
import CCDCSlicePreview from './ccdcSlicePreview'
import BandSelection from './bandSelection'
import {setRecipeGeometryLayer} from 'app/home/map/recipeGeometryLayer'
import _ from 'lodash'
import ChartPixelButton from '../ccdc/panels/chartPixelButton'
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
    recipe: _.omit(recipe, 'ui')
})

class _CCDCSlice extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, recipeContext: {statePath}, initialized} = this.props
        return (
            <div>
                <MapToolbar statePath={[statePath, 'ui']} mapContext={recipeId} labelLayerIndex={3}>
                    <ChartPixelButton onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}/>
                </MapToolbar>
                <CCDCSliceToolbar/>
                {initialized
                    ? <React.Fragment>
                        <CCDCSlicePreview/>
                        <BandSelection/>
                        <ChartPixel/>
                    </React.Fragment>
                    : null}
            </div>
        )
    }

    componentDidMount() {
        this.setAoiLayer(true)
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const prevAsset = prevProps.recipe.model.source.asset
        const asset = this.props.recipe.model.source.asset
        console.log(prevAsset, asset)
        this.setAoiLayer(prevAsset !== asset)
    }

    setAoiLayer(fitLayer) {
        const {recipeId, recipe, componentWillUnmount$} = this.props
        setRecipeGeometryLayer({
            contextId: recipeId,
            layerSpec: {id: 'aoi', layerIndex: 1, recipe},
            destroy$: componentWillUnmount$,
            onInitialized: () => {
                if (fitLayer && this.props.tabCount === 1) {
                    sepalMap.setContext(recipeId)
                    sepalMap.getContext(recipeId).fitLayer('aoi')
                }
            }
        })
    }
}

const CcdcSlice = compose(
    _CCDCSlice,
    connect(mapStateToProps),
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'CCDC_SLICE',
    labels: {
        name: msg('process.ccdcSlice.create'),
        creationDescription: msg('process.ccdcSlice.description'),
        tabPlaceholder: msg('process.ccdcSlice.tabPlaceholder')
    },
    components: {
        recipe: CcdcSlice
    },
    beta: true
})
