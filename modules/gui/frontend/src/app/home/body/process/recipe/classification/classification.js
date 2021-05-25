import {Aoi} from '../aoi'
import {DataCollectionEvents, DataCollectionEventsContext} from './dataCollectionEvents'
import {Map} from 'app/home/map/map'
import {compose} from 'compose'
import {getDefaultModel} from './classificationRecipe'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import ClassificationToolbar from './panels/classificationToolbar'
import CollectPanel from './panels/collect/collectPanel'
import React from 'react'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    images: selectFrom(recipe, 'model.inputImagery.images'),
    layers: selectFrom(recipe, 'layers')
})

class _Classification extends React.Component {
    dataCollectionEvents = new DataCollectionEvents()

    constructor(props) {
        super(props)
        const {layers, recipeId} = props
        initializeLayers(recipeId, layers, [
            {
                id: 'referenceData',
                type: 'ReferenceData',
                description: msg('featureLayerSources.ReferenceData.description'),
                defaultEnabled: true
            }
        ])
    }

    render() {
        const {initialized, images} = this.props
        return (
            <DataCollectionEventsContext.Provider value={{dataCollectionEvents: this.dataCollectionEvents}}>
                <Map>
                    <ClassificationToolbar dataCollectionEvents={this.dataCollectionEvents}/>
                    <Aoi value={images && images.length && images[0]}/>
                    {initialized
                        ? (
                            <CollectPanel dataCollectionEvents={this.dataCollectionEvents}/>
                        )
                        : null}
                </Map>
            </DataCollectionEventsContext.Provider>
        )
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
