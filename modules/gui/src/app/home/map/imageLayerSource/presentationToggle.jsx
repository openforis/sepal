import React from 'react'

import {actionBuilder} from '~/action-builder'
import {recipePath} from '~/app/home/body/process/recipe'
import {withLayers} from '~/app/home/body/process/withLayers'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Buttons} from '~/widget/buttons'

import {isPresentationFeatureLayer, withFeatureLayerDisabled} from '../featureLayerOrder'

// Legend, Palette and Values are presentation overlays: they render over the map rather than in it, and are
// not part of the ordered layer stack. Their visibility belongs beside the visualization that produces
// them, so this sits in the visualization combo rather than in the layer list. At most one exists for an
// area - the image layer's visParams type decides which.
//
// A single-option multiple Buttons, exactly as the REV control does it: selection drives the highlighted
// look, so no shared component needs a new API.
class _PresentationToggle extends React.Component {
    render() {
        const featureLayer = this.presentationFeatureLayer()
        if (!featureLayer) {
            return null
        }
        const {source} = featureLayer
        const enabled = featureLayer.disabled !== true
        return (
            <Buttons
                selected={enabled ? [true] : []}
                look='transparent'
                shape='pill'
                air='less'
                size='x-small'
                options={[{
                    value: true,
                    label: msg(`featureLayerSources.${source.type}.type`),
                    tooltip: msg(`featureLayerSources.${source.type}.description`)
                }]}
                multiple
                onChange={() => this.toggle(source.id, enabled)}
            />
        )
    }

    presentationFeatureLayer() {
        const {featureLayerSources, layers: {areas}, mapArea: {area}} = this.props
        const featureLayers = (areas[area] && areas[area].featureLayers) || []
        return featureLayers
            .map(featureLayer => {
                const source = featureLayerSources.find(({id}) => id === featureLayer.sourceId)
                return source && isPresentationFeatureLayer(source.type)
                    ? {...featureLayer, source}
                    : null
            })
            .find(Boolean)
    }

    // Only the presentation feature layer's disabled flag changes: no visualization selection, no layer
    // ordering, no layerConfig.
    toggle(sourceId, enabled) {
        const {recipe, layers: {areas}, mapArea: {area}} = this.props
        const featureLayers = (areas[area] && areas[area].featureLayers) || []
        actionBuilder('TOGGLE_PRESENTATION_FEATURE_LAYER', {sourceId, area})
            .set(
                [recipePath(recipe.id), 'layers.areas', area, 'featureLayers'],
                withFeatureLayerDisabled(featureLayers, sourceId, enabled)
            )
            .dispatch()
    }
}

// withLayers already composes withRecipe and withMapArea, so recipe and mapArea arrive through it.
export const PresentationToggle = compose(
    _PresentationToggle,
    withLayers()
)
