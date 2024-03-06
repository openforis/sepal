import {Aoi} from '../aoi'
import {ClassificationToolbar} from './panels/classificationToolbar'
import {CollectPanel} from './panels/collect/collectPanel'
import {DataCollectionManager, DataCollectionManagerContext} from './dataCollectionManager'
import {Map} from 'app/home/map/map'
import {RecipeActions, getDefaultModel} from './classificationRecipe'
import {compose} from 'compose'
import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import React from 'react'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    images: selectFrom(recipe, 'model.inputImagery.images'),
    savedLayers: selectFrom(recipe, 'layers'),
    trainingDataSets: selectFrom(recipe, 'model.trainingData.dataSets')
})

class _Classification extends React.Component {

    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        this.dataCollectionManager = new DataCollectionManager(recipeId)
        this.recipeActions = RecipeActions(recipeId)
        initializeLayers({
            recipeId,
            savedLayers,
            additionalFeatureLayerSources: [{
                id: 'referenceData',
                type: 'ReferenceData',
                description: msg('featureLayerSources.ReferenceData.description'),
                defaultEnabled: true
            }]
        })
    }

    render() {
        const {initialized, images} = this.props
        return (
            <DataCollectionManagerContext dataCollectionManager={this.dataCollectionManager}>
                <Map>
                    <ClassificationToolbar dataCollectionManager={this.dataCollectionManager}/>
                    <Aoi value={images && images.length && images[0]}/>
                    {initialized
                        ? (
                            <CollectPanel dataCollectionManager={this.dataCollectionManager}/>
                        )
                        : null}
                </Map>
            </DataCollectionManagerContext>
        )
    }

    componentDidMount() {
        const {trainingDataSets} = this.props
        const referenceData = trainingDataSets
            .filter(({type}) => type !== 'RECIPE')
            .map(({dataSetId, referenceData}) =>
                referenceData.map(point => ({...point, dataSetId}))
            )
            .flat()
        const countPerClass = {}
        referenceData.forEach(point => {
            const pointClass = point['class']
            countPerClass[pointClass] = (countPerClass[pointClass] || 0) + 1
        })
        this.recipeActions.setCountPerClass(countPerClass)
    }
}

const Classification = compose(
    _Classification,
    recipe({getDefaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe =>
    (selectFrom(recipe, 'model.inputImagery.images') || [])
        .filter(({type}) => type === 'RECIPE_REF')
        .map(({id}) => id)

export default () => ({
    id: 'CLASSIFICATION',
    labels: {
        name: msg('process.classification.create'),
        creationDescription: msg('process.classification.description'),
        tabPlaceholder: msg('process.classification.tabPlaceholder'),
    },
    components: {
        recipe: Classification
    },
    getDependentRecipeIds,
    getDateRange(_recipe) {
        return null
    },
    getAvailableBands,
    getPreSetVisualizations
})
