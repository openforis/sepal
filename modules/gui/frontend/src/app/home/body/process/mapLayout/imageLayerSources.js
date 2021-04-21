import {Padding} from 'widget/padding'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {getImageLayerSource} from 'app/home/map/imageLayerSource/imageLayerSource'
import {msg} from 'translate'
import {removeArea} from './layerAreas'
import {withLayers} from '../withLayers'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

export class _ImageLayerSources extends React.Component {
    render() {
        const {standardImageLayerSources, additionalImageLayerSources} = this.props
        return (
            <ScrollableContainer>
                <Scrollable>
                    <Padding noHorizontal>
                        {standardImageLayerSources.map(source => this.renderSource({source, removable: false}))}
                        {additionalImageLayerSources.map(source => this.renderSource({source, removable: true}))}
                    </Padding>
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderSource({source, removable}) {
        const {drag$, recipe} = this.props
        const {description} = getImageLayerSource({recipe, source})
        return source && source.id
            ? (
                <SuperButton
                    key={source.id}
                    title={msg(`imageLayerSources.${source.type}`)}
                    description={description}
                    removeMessage={msg('map.layout.layer.remove.message')}
                    removeTooltip={msg('map.layout.layer.remove.tooltip')}
                    drag$={drag$}
                    dragValue={{
                        imageLayer: {sourceId: source.id},
                        featureLayers: []
                    }}
                    onRemove={removable
                        ? () => this.removeSource(source.id)
                        : null}
                />
            )
            : null
    }

    removeSource(sourceId) {
        const {layers: {areas}, recipeActionBuilder} = this.props
        const removeAreaBySource = (areas, sourceId) => {
            const area = _.chain(areas)
                .pickBy(({imageLayer: {sourceId: areaSourceId}}) => areaSourceId === sourceId)
                .keys()
                .first()
                .value()
            return area
                ? removeAreaBySource(removeArea({areas, area}), sourceId)
                : areas
        }
        recipeActionBuilder('REMOVE_IMAGE_LAYER_SOURCE')
            .del(['layers.additionalImageLayerSources', {id: sourceId}])
            .set('layers.areas', removeAreaBySource(areas, sourceId))
            .dispatch()
    }
}

export const ImageLayerSources = compose(
    _ImageLayerSources,
    withLayers(),
    withRecipe(recipe => ({recipe}))
)

ImageLayerSources.propTypes = {
    drag$: PropTypes.object
}
