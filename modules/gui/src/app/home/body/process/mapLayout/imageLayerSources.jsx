import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {recipeActionBuilder, recipePath} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {select} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Padding} from '~/widget/padding'
import {Scrollable} from '~/widget/scrollable'

import {getImageLayerSource} from '../imageLayerSourceRegistry'
import {withLayers} from '../withLayers'
import styles from './imageLayerSources.module.css'
import {removeArea} from './layerAreas'

export class _ImageLayerSources extends React.Component {
    render() {
        const {standardImageLayerSources, additionalImageLayerSources, additionalFeatureLayerSources = []} = this.props
        return (
            <Scrollable direction='y'>
                <Padding noHorizontal>
                    <Layout type='vertical' spacing='tight'>
                        {standardImageLayerSources.map(source => this.renderSource({source, removable: false}))}
                        {additionalImageLayerSources.map(source => this.renderSource({source, removable: true}))}
                        {additionalFeatureLayerSources.map(source => this.renderFeatureSource(source))}
                    </Layout>
                </Padding>
            </Scrollable>
        )
    }

    renderFeatureSource(source) {
        const {recipeId} = this.props
        const {sourceConfig: {label, asset, description} = {}} = source
        // Feature sources render last, aren't draggable (no drag$), and only support removal.
        return source && source.id
            ? (
                <ListItem key={source.id}>
                    <div className={styles.featureSource}>
                        <CrudItem
                            title={label || asset}
                            description={description}
                            removeTooltip={msg('map.layout.layer.remove.tooltip')}
                            onRemove={() => removeFeatureLayerSource({sourceId: source.id, recipeId})}
                        />
                    </div>
                </ListItem>
            )
            : null
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
                    <div className={removable ? styles.removableImageSource : styles.imageSource}>
                        <CrudItem
                            key={source.id}
                            title={msg(`imageLayerSources.${source.type}.label`)}
                            description={description}
                            removeTooltip={msg('map.layout.layer.remove.tooltip')}
                            onRemove={removable ? () => this.removeSource(source.id) : null}
                        />
                    </div>
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

export const removeFeatureLayerSource = ({sourceId, recipeId}) => {
    const areas = select(recipePath(recipeId, 'layers.areas'))
    // Drop the source and any per-area references to it, leaving the rest of each area's order intact.
    const updatedAreas = _.mapValues(areas, area => ({
        ...area,
        featureLayers: (area.featureLayers || []).filter(({sourceId: id}) => id !== sourceId)
    }))
    const actionBuilder = recipeActionBuilder(recipeId)
    actionBuilder('REMOVE_FEATURE_LAYER_SOURCE')
        .del(['layers.additionalFeatureLayerSources', {id: sourceId}])
        .set('layers.areas', updatedAreas)
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
