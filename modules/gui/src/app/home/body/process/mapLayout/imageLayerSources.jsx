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
import {assetDisplayLabel} from './assetLabel'
import styles from './imageLayerSources.module.css'
import {removeArea} from './layerAreas'
import {isEditableLayerSource} from './layerSourceEdit'

export class _ImageLayerSources extends React.Component {
    render() {
        const {standardImageLayerSources, additionalImageLayerSources, additionalFeatureLayerSources = []} = this.props
        return (
            <Scrollable direction='y'>
                <Padding noHorizontal>
                    <Layout type='vertical' spacing='tight'>
                        {standardImageLayerSources.map(source => this.renderSource({source, userAdded: false}))}
                        {additionalImageLayerSources.map(source => this.renderSource({source, userAdded: true}))}
                        {additionalFeatureLayerSources.map(source => this.renderFeatureSource(source))}
                    </Layout>
                </Padding>
            </Scrollable>
        )
    }

    renderFeatureSource(source) {
        const {recipeId, onEdit} = this.props
        const {sourceConfig: {label, asset} = {}} = source
        // Feature sources render last and aren't draggable (no drag$). Match the image source rows: keep the short
        // source type on the first line and let the user-facing asset name wrap on the second line without
        // displacing the actions.
        return source && source.id
            ? (
                <ListItem key={source.id}>
                    <div className={styles.featureSource}>
                        <CrudItem
                            buttonSpacing='tight'
                            title={msg(`featureLayerSources.${source.type}.type`)}
                            description={assetDisplayLabel({label, asset})}
                            editTooltip={msg('map.layout.layer.edit.tooltip')}
                            removeTooltip={msg('map.layout.layer.remove.tooltip')}
                            onEdit={isEditableLayerSource(source) ? () => onEdit(source) : null}
                            onRemove={() => removeFeatureLayerSource({sourceId: source.id, recipeId})}
                        />
                    </div>
                </ListItem>
            )
            : null
    }

    renderSource({source, userAdded}) {
        const {drag$, recipe, onEdit} = this.props
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
                    <ActionsWithoutDrag className={userAdded ? styles.removableImageSource : styles.imageSource}>
                        <CrudItem
                            key={source.id}
                            buttonSpacing='tight'
                            title={msg(`imageLayerSources.${source.type}.label`)}
                            description={description}
                            editTooltip={msg('map.layout.layer.edit.tooltip')}
                            removeTooltip={msg('map.layout.layer.remove.tooltip')}
                            onEdit={userAdded && isEditableLayerSource(source) ? () => onEdit(source) : null}
                            onRemove={userAdded ? () => this.removeSource(source.id) : null}
                        />
                    </ActionsWithoutDrag>
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

// A row is dragged by a pan gesture its list item recognizes from pointer events on the whole row. A pointer pressed
// on one of the row's buttons is kept from the row, so pressing Edit or Remove never starts a drag. Only pointer
// events are stopped: React and the buttons handle mouse and click events as before.
class ActionsWithoutDrag extends React.Component {
    element = React.createRef()

    render() {
        const {className, children} = this.props
        return <div ref={this.element} className={className}>{children}</div>
    }

    componentDidMount() {
        this.element.current.addEventListener('pointerdown', stopOnButton)
    }

    componentWillUnmount() {
        this.element.current?.removeEventListener('pointerdown', stopOnButton)
    }
}

const stopOnButton = e => {
    if (e.target.closest('button')) {
        e.stopPropagation()
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
    drag$: PropTypes.object,
    onEdit: PropTypes.func
}
