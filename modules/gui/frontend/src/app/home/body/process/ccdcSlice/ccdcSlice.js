import {compose} from 'compose'
import {connect} from 'store'
import {defaultModel} from './ccdcSliceRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {sepalMap} from 'app/home/map/map'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import CCDCSliceToolbar from './panels/ccdcSliceToolbar'
import CCDCSlicePreview from './ccdcSlicePreview'
import BandSelection from './bandSelection'
import {setRecipeGeometryLayer} from '../../../map/recipeGeometryLayer'
import _ from 'lodash'

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

class _CCDC extends React.Component {
    render() {
        const {recipeId, recipeContext: {statePath}, initialized} = this.props
        return (
            <div>
                <MapToolbar statePath={[statePath, 'ui']} mapContext={recipeId} labelLayerIndex={3}/>
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

    componentDidUpdate() {
        this.setAoiLayer(false)
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
    _CCDC,
    connect(mapStateToProps),
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'CCDC_SLICE',
    labels: {
        name: msg('process.ccdcSlice.create'),
        creationDescription: msg('process.ccdcSlice.description'),
        tabPlaceholder: msg('process.ccdcSlice.tabPlaceholder'),
    },
    components: {
        recipe: CcdcSlice
    },
    beta: true
})
