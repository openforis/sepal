import {compose} from 'compose'
import {getDefaultModel} from './classificationRecipe'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setRecipeGeometryLayer} from 'app/home/map/recipeGeometryLayer'
import BandSelection from './bandSelection'
import ClassificationPreview from './classificationPreview'
import ClassificationToolbar from './panels/classificationToolbar'
import MapScale from 'app/home/map/mapScale'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import ReferenceDataLayer from './referenceDataLayer'
import {DataCollectionEvents} from './dataCollectionEvents'
import CollectPanel from './panels/collect/collectPanel'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    images: selectFrom(recipe, 'model.inputImagery.images'),
    trainingData: selectFrom(recipe, 'model.trainingData')
})

class _Classification extends React.Component {
    dataCollectionEvents = new DataCollectionEvents()

    render() {
        const {recipeContext: {statePath}, trainingData, initialized} = this.props
        return (
            <React.Fragment>
                <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}/>
                <MapScale/>
                <ClassificationToolbar/>

                {initialized && trainingData.dataSets.length
                    ? <React.Fragment>
                        <ClassificationPreview/>
                        <ReferenceDataLayer dataCollectionEvents={this.dataCollectionEvents}/>
                        <CollectPanel dataCollectionEvents={this.dataCollectionEvents}/>
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
    recipe({getDefaultModel, mapRecipeToProps})
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
