import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Padding} from '~/widget/padding'
import {Scrollable, ScrollableContainer} from '~/widget/scrollable'
import {compose} from '~/compose'
import {getImageLayerSource} from '../imageLayerSourceRegistry'
import {msg} from '~/translate'
import {recipeActionBuilder, recipePath} from '~/app/home/body/process/recipe'
import {removeArea} from './layerAreas'
import {select} from '~/store'
import {uuid} from '~/uuid'
import {withLayers} from '../withLayers'
import {withRecipe} from '~/app/home/body/process/recipeContext'
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
                        <Layout type='vertical' spacing='tight'>
                            {standardImageLayerSources.map(source => this.renderSource({source, removable: false}))}
                            {additionalImageLayerSources.map(source => this.renderSource({source, removable: true}))}
                        </Layout>
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
                <ListItem
                    key={source.id}
                    drag$={drag$}
                    dragValue={{
                        id: uuid(),
                        imageLayer: {sourceId: source.id},
                        featureLayers: []
                    }}>
                    <CrudItem
                        key={source.id}
                        title={msg(`imageLayerSources.${source.type}.label`)}
                        description={description}
                        removeTooltip={msg('map.layout.layer.remove.tooltip')}
                        onRemove={removable ? () => this.removeSource(source.id) : null}
                    />
                </ListItem>
            )
            : null
    }

    removeSource(sourceId) {
        const {recipeId} = this.props
        removeImageLayerSource({sourceId, recipeId})
        // const {layers: {areas}, recipeActionBuilder} = this.props
        // const removeAreaBySource = (areas, sourceId) => {
        //     const area = _.chain(areas)
        //         .pickBy(({imageLayer: {sourceId: areaSourceId}}) => areaSourceId === sourceId)
        //         .keys()
        //         .first()
        //         .value()
        //     return area
        //         ? removeAreaBySource(removeArea({areas, area}), sourceId)
        //         : areas
        // }
        // recipeActionBuilder('REMOVE_IMAGE_LAYER_SOURCE')
        //     .del(['layers.additionalImageLayerSources', {id: sourceId}])
        //     .set('layers.areas', removeAreaBySource(areas, sourceId))
        //     .dispatch()
    }
}

export const removeImageLayerSource = ({sourceId, recipeId}) => {
    const areas = select(recipePath(recipeId, 'layers.areas'))
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
    const actionBuilder = recipeActionBuilder(recipeId)
    actionBuilder('REMOVE_IMAGE_LAYER_SOURCE')
        .del(['layers.additionalImageLayerSources', {id: sourceId}])
        .set('layers.areas', removeAreaBySource(areas, sourceId))
        .dispatch()
}

export const ImageLayerSources = compose(
    _ImageLayerSources,
    withLayers(),
    withRecipe(recipe => ({recipe}))
)

ImageLayerSources.propTypes = {
    drag$: PropTypes.object
}
