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
                <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}/>
                <MapScale/>
                <CCDCSliceToolbar/>
                {initialized
                    ? <React.Fragment>
                        <CCDCSlicePreview/>
                        <BandSelection/>
                    </React.Fragment>
                    : null}
            </div>
        )
    }

    componentDidMount() {
        this.setAoiLayer(true)
    }

    componentDidUpdate(prevProps, _prevState, _snapshot) {
        const prevSource = prevProps.recipe.model.source.id
        const source = this.props.recipe.model.source.id
        this.setAoiLayer(prevSource !== source)
    }

    setAoiLayer(fitLayer) {
        const {sepalMap, recipe, componentWillUnmount$} = this.props
        if (recipe.model.source.id) {
            setRecipeGeometryLayer({
                sepalMap,
                layerSpec: {id: 'aoi', layerIndex: 1, recipe},
                destroy$: componentWillUnmount$,
                onInitialized: () => fitLayer && sepalMap.fitLayer('aoi')
            })
        }
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
