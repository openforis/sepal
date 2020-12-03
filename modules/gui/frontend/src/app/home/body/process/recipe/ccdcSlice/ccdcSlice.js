import {RecipeActions, defaultModel} from './ccdcSliceRecipe'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setRecipeGeometryLayer} from 'app/home/map/recipeGeometryLayer'
import BandSelection from './bandSelection'
import CCDCSlicePreview from './ccdcSlicePreview'
import CCDCSliceToolbar from './panels/ccdcSliceToolbar'
import ChartPixel from './panels/chartPixel'
import ChartPixelButton from '../ccdc/panels/chartPixelButton'
import MapScale from 'app/home/map/mapScale'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import _ from 'lodash'

const mapStateToProps = _state => ({})

const mapRecipeToProps = recipe => ({
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
                <MapScale/>
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

    componentDidUpdate(prevProps, _prevState, _snapshot) {
        const prevAsset = prevProps.recipe.model.source.asset
        const asset = this.props.recipe.model.source.asset
        this.setAoiLayer(prevAsset !== asset)
    }

    setAoiLayer(fitLayer) {
        const {mapContext, recipe, componentWillUnmount$} = this.props
        setRecipeGeometryLayer({
            mapContext,
            layerSpec: {id: 'aoi', layerIndex: 1, recipe},
            destroy$: componentWillUnmount$,
            onInitialized: () => fitLayer && mapContext.sepalMap.fitLayer('aoi')
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
    }
})
