import {compose} from 'compose'
import {defaultModel} from './classificationRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setRecipeGeometryLayer} from 'app/home/map/recipeGeometryLayer'
import BandSelection from './bandSelection'
import ClassificationPreview from './classificationPreview'
import ClassificationToolbar from './panels/classificationToolbar'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    images: selectFrom(recipe, 'model.inputImagery.images'),
    trainingData: selectFrom(recipe, 'model.trainingData')
})

class _Classification extends React.Component {
    render() {
        const {recipeContext: {statePath}, trainingData, initialized} = this.props
        return (
            <React.Fragment>
                <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}/>
                <ClassificationToolbar/>

                {initialized && trainingData.dataSets.length
                    ? <React.Fragment>
                        <ClassificationPreview/>
                        <BandSelection/>
                    </React.Fragment>
                    : null}
            </React.Fragment>
        )
    }

    componentDidMount() {
        this.setAoiLayer()
    }

    componentDidUpdate() {
        this.setAoiLayer()
    }

    setAoiLayer() {
        const {images, mapContext, componentWillUnmount$} = this.props
        setRecipeGeometryLayer({
            mapContext,
            layerSpec: {id: 'aoi', layerIndex: 1, recipe: images && images.length > 0 ? images[0] : null},
            destroy$: componentWillUnmount$,
            onInitialized: () => mapContext.sepalMap.fitLayer('aoi')
        })
    }
}

const Classification = compose(
    _Classification,
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'CLASSIFICATION',
    labels: {
        name: msg('process.classification.create'),
        creationDescription: msg('process.classification.description'),
        tabPlaceholder: msg('process.classification.tabPlaceholder'),
    },
    components: {
        recipe: Classification
    }
})
