import {ImageLayerSource} from '../../../map/imageLayerSource'
import {Padding} from 'widget/padding'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {msg} from 'translate'
import {removeArea} from './layerAreas'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapRecipeToProps = recipe => {
    return {
        sources: selectFrom(recipe, 'ui.imageLayerSources'),
        additionalSources: selectFrom(recipe, 'layers.additionalImageLayerSources') || [],
        areas: selectFrom(recipe, 'layers.areas') || [],
    }
}

export class _ImageLayerSources extends React.Component {
    render() {
        const {sources, additionalSources} = this.props
        return (
            <ScrollableContainer>
                <Scrollable>
                    <Padding noHorizontal>
                        {sources.map(source => this.renderSource({source, removable: false}))}
                        {additionalSources.map(source => this.renderSource({source, removable: true}))}
                    </Padding>
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderSource({source, removable}) {
        const {drag$} = this.props
        return source && source.id
            ? (
                <SuperButton
                    key={source.id}
                    title={msg(`imageLayerSources.${source.type}`)}
                    description={<ImageLayerSource source={source} output={'DESCRIPTION'}/>}
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
        const {areas, recipeActionBuilder} = this.props
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
    withRecipe(mapRecipeToProps)
)

ImageLayerSources.propTypes = {
    drag$: PropTypes.object
}
