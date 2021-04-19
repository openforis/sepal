import {AoiLayer} from 'app/home/map/aoiLayer'
import {LabelsLayer} from 'app/home/map/labelsLayer'
import {compose} from 'compose'
import {selectFrom} from 'stateUtils'
import {withMapContext} from './mapContext'
import {withRecipe} from '../body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const mapRecipeToProps = recipe => ({
    sources: selectFrom(recipe, 'ui.featureLayerSources') || [],
})
const _FeatureLayers = ({sources, selectedLayers, map}) =>
    map
        ? selectedLayers.map((layer, i) => {
            const source = sources.find(({id}) => id === layer.sourceId)
            return (
                <FeatureLayer
                    key={i}
                    id={source.type}
                    source={source}
                    layerConfig={layer.layerConfig}
                    layerIndex={i + 1}
                    map={map}
                />
            )
        })
        : null

export const FeatureLayers = compose(
    _FeatureLayers,
    withRecipe(mapRecipeToProps),
    withMapContext()
)

FeatureLayers.propTypes = {
    map: PropTypes.any,
    selectedLayers: PropTypes.any
}

const _FeatureLayer = ({source, map, recipe, layerConfig, layerIndex}) => {
    const id = source.type
    switch(source.type) {
    case 'Labels': return <LabelsLayer id={id} layerIndex={layerIndex} map={map}/>
    case 'Aoi': return <AoiLayer id={source.type} layerConfig={layerConfig} layerIndex={layerIndex} recipe={recipe} map={map}/>
    default: throw Error(`Unsupported feature layer type: ${source.type}`)
    }
}

export const FeatureLayer = compose(
    _FeatureLayer,
    withRecipe(recipe => ({recipe}))
)

