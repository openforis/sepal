import PropTypes from 'prop-types'
import React from 'react'

import {SceneAreasLayer} from '~/app/home/body/process/recipe/opticalMosaic/sceneAreasLayer'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withLayers} from '~/app/home/body/process/withLayers'
import {AoiLayer} from '~/app/home/map/aoiLayer'
import {LabelsLayer} from '~/app/home/map/labelsLayer'
import {compose} from '~/compose'

import {ReferenceDataLayer} from '../body/process/recipe/classification/referenceDataLayer'
import {LegendLayer} from './legendLayer'
import {PaletteLayer} from './paletteLayer'
import {ValuesLayer} from './valuesLayer'

const _FeatureLayers = ({featureLayerSources, featureLayers, map}) =>
    map
        ? featureLayers
            .filter(({disabled}) => disabled !== true)
            .map((layer, i) => {
                const source = featureLayerSources.find(({id}) => id === layer.sourceId)
                return (
                    source
                        ? (
                            <FeatureLayer
                                key={i}
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
    map: PropTypes.any,
}

class _FeatureLayer extends React.Component {
    render() {
        const {source, map, recipe, layerConfig, layerIndex} = this.props
        const id = source.type
        switch (source.type) {
            case 'Labels':return <LabelsLayer id={id} layerIndex={layerIndex} map={map}/>
            case 'Legend': return <LegendLayer/>
            case 'Palette': return <PaletteLayer/>
            case 'Values': return <ValuesLayer/>
            case 'Aoi': return (
                <AoiLayer
                    id={source.type}
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

