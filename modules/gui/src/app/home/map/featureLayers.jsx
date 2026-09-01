import PropTypes from 'prop-types'
import React from 'react'

import {SceneAreasLayer} from '~/app/home/body/process/recipe/opticalMosaic/sceneAreasLayer'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withLayers} from '~/app/home/body/process/withLayers'
import {AoiLayer} from '~/app/home/map/aoiLayer'
import {EETableAssetLayer} from '~/app/home/map/eeTableAssetLayer'
import {LabelsLayer} from '~/app/home/map/labelsLayer'
import {compose} from '~/compose'

import {ReferenceDataLayer} from '../body/process/recipe/classification/referenceDataLayer'
import {isPresentationFeatureLayer} from './featureLayerOrder'
import {LegendLayer} from './legendLayer'
import {PaletteLayer} from './paletteLayer'
import {ValuesLayer} from './valuesLayer'

// Palette, Legend and Values annotate the image layer on the map - they read its visParams straight out of the
// store - so with no image layer they would annotate one that is not there. Withholding them is done here, at
// render: the persisted entry and the user's enabled preference are untouched, and both come back with the layer.
// Every other feature layer stands on its own and is unaffected.
const describesMissingImage = ({type}, imageLayer) =>
    !imageLayer && isPresentationFeatureLayer(type)

const _FeatureLayers = ({featureLayerSources, featureLayers, imageLayer, map}) =>
    map
        ? featureLayers
            .filter(({disabled}) => disabled !== true)
            .map((layer, i) => {
                const source = featureLayerSources.find(({id}) => id === layer.sourceId)
                return (
                    source && !describesMissingImage(source, imageLayer)
                        ? (
                            <FeatureLayer
                                key={layer.sourceId}
                                id={source.type}
                                source={source}
                                layerConfig={layer.layerConfig}
                                layerIndex={i + 1}
                                map={map}
                            />
                        )
                        : null
                )
            })
        : null

export const FeatureLayers = compose(
    _FeatureLayers,
    withLayers()
)

FeatureLayers.propTypes = {
    featureLayers: PropTypes.any,
    imageLayer: PropTypes.any,
    map: PropTypes.any,
}

class _FeatureLayer extends React.Component {
    render() {
        const {source, map, recipe, layerConfig, layerIndex} = this.props
        switch (source.type) {
            case 'Labels': return (
                <LabelsLayer
                    id={source.id}
                    layerConfig={layerConfig}
                    layerIndex={layerIndex}
                    map={map}
                />
            )
            case 'Legend': return <LegendLayer/>
            case 'Palette': return <PaletteLayer/>
            case 'Values': return <ValuesLayer/>
            case 'Aoi': return (
                <AoiLayer
                    id={source.id}
                    layerConfig={layerConfig}
                    layerIndex={layerIndex}
                    recipe={recipe}
                    map={map}
                />
            )
            case 'SceneAreas':
                return <SceneAreasLayer map={map}/>
            case 'ReferenceData':
                return <ReferenceDataLayer map={map}/>
            case 'EETableAsset':
                return (
                    <EETableAssetLayer
                        source={source}
                        layerConfig={layerConfig}
                        layerIndex={layerIndex}
                        map={map}
                    />
                )
            default:
                throw Error(`Unsupported feature layer type: ${source.type}`)
        }
    }

    renderFeature(component) {
        // TODO: Feature layer source should define the image layer types it supports
        //   Legend, Palette, Values only support RecipeImageLayer and AssetImageLayer
        //   Use both for populate the featureLayerSources buttons in the menu, and rendering here
        return component
    }
}

export const FeatureLayer = compose(
    _FeatureLayer,
    withRecipe(recipe => ({recipe})),
    withLayers()
)

