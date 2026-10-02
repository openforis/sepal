import _ from 'lodash'
import React from 'react'

import {recipeActionBuilder, recipePath} from '~/app/home/body/process/recipe'
import {select} from '~/store'

// Input panels keep the sources they maintain under the id of the asset or recipe they show, and own their settings.
// The layout's Add forms give a source an id of its own; only those sources are edited here, whatever they show.
export const isEditableLayerSource = source =>
    !!source?.id && ![source.sourceConfig?.asset, source.sourceConfig?.recipeId].includes(source.id)

// Editing a user-added source changes what it shows, not where it is shown: the source keeps its id, type and place in
// the source list, and every area keeps using it. Each area's own settings for the source pass through
// `reconcileLayerConfig`, which returns them as they are, adjusted, or undefined when the new source leaves nothing of
// them valid.
export const editLayerSource = ({layers, sourceId, sourceConfig, reconcileLayerConfig = layerConfig => layerConfig}) => {
    const collection = sourceCollection(layers, sourceId)
    if (!isEditableLayerSource(layers[collection].find(({id}) => id === sourceId))) {
        throw Error(`Layer source maintained by an input panel: ${sourceId}`)
    }
    const reconcile = withReconciledLayerConfig(reconcileLayerConfig)
    const areas = _.mapValues(layers.areas, area => collection === IMAGE_SOURCES
        ? {...area, imageLayer: area.imageLayer?.sourceId === sourceId ? reconcile(area.imageLayer) : area.imageLayer}
        : {...area, featureLayers: (area.featureLayers || []).map(layer => layer.sourceId === sourceId ? reconcile(layer) : layer)}
    )
    const sources = layers[collection].map(source => source.id === sourceId ? {...source, sourceConfig} : source)
    return {...layers, [collection]: sources, areas}
}

export const updateLayerSource = ({recipeId, sourceId, sourceConfig, reconcileLayerConfig}) => {
    const layers = select(recipePath(recipeId, 'layers'))
    const collection = sourceCollection(layers, sourceId)
    const edited = editLayerSource({layers, sourceId, sourceConfig, reconcileLayerConfig})
    recipeActionBuilder(recipeId)('UPDATE_LAYER_SOURCE', {sourceId})
        .set(['layers', collection], edited[collection])
        .set('layers.areas', edited.areas)
        .dispatch()
}

// The source-selection forms are opened with a `source` to edit it. The form then starts from that source's values;
// opened without one, it adds a source and starts empty.
export const withSourceValues = sourceValues => WrappedComponent => {
    const WithSourceValues = props => {
        const source = props.activatable?.source
        return React.createElement(WrappedComponent, source ? {...props, values: sourceValues(source)} : props)
    }
    return WithSourceValues
}

// An area's style and filter for a table name its properties. A table without one of them leaves that part invalid,
// so it falls back to the source's default; whatever names no missing property is kept.
export const reconcileFeatureLayerConfig = columns => layerConfig => {
    const missing = property => property && !columns.includes(property)
    const {style, filter} = layerConfig || {}
    const styleProperty = style?.colorMode === 'COLORS_FROM_PROPERTY'
        ? style.colorProperty
        : style?.colorMode === 'COLORS_BY_VALUE' ? style.valueProperty : null
    const filterValid = !(filter?.constraints || []).some(({property}) => missing(property))
    const reconciled = _.omitBy({
        ...layerConfig,
        style: missing(styleProperty) ? undefined : style,
        filter: filterValid ? filter : undefined
    }, _.isUndefined)
    return _.isEmpty(reconciled) ? undefined : reconciled
}

const IMAGE_SOURCES = 'additionalImageLayerSources'
const FEATURE_SOURCES = 'additionalFeatureLayerSources'

const sourceCollection = (layers, sourceId) => {
    const collection = [IMAGE_SOURCES, FEATURE_SOURCES]
        .find(collection => (layers[collection] || []).some(({id}) => id === sourceId))
    if (!collection) {
        throw Error(`No user-added layer source: ${sourceId}`)
    }
    return collection
}

const withReconciledLayerConfig = reconcileLayerConfig => layer => {
    const layerConfig = reconcileLayerConfig(layer.layerConfig)
    if (layerConfig === layer.layerConfig) {
        return layer
    }
    return layerConfig === undefined
        ? _.omit(layer, 'layerConfig')
        : {...layer, layerConfig}
}
