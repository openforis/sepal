import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {recipeActionBuilder, recipePath} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {select} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {ButtonSelect} from '~/widget/buttonSelect'
import {Confirm} from '~/widget/confirm'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Padding} from '~/widget/padding'
import {Scrollable} from '~/widget/scrollable'

import {withLayers} from '../withLayers'
import {assetDisplayLabel} from './assetLabel'
import {imageLayerSourcesForAreas} from './dependencyLayerSources'
import styles from './imageLayerSources.module.css'
import {removeArea} from './layerAreas'
import {isEditableLayerSource} from './layerSourceEdit'
import {layerSourceDescription, layerSourceName, layerSourceNamePath} from './layerSourceNames'
import {missingImageLayerSources, missingSourceMessage} from './missingLayerSources'

// Every row's actions are offered by one menu, at the same place on every row; a row offering none keeps the place
// empty. A source is edited where the layout owns it and renamed where the recipe's inputs or a map area keep it.
// Deleting is offered with either, disabled where the recipe's inputs own the source, and asks first.
export class _ImageLayerSources extends React.Component {
    state = {
        deleting: null
    }

    render() {
        const {standardImageLayerSources, dependencyImageLayerSources = [], additionalImageLayerSources, additionalFeatureLayerSources = []} = this.props
        return (
            <Scrollable direction='y'>
                <Padding noHorizontal>
                    <Layout type='vertical' spacing='tight'>
                        {standardImageLayerSources.map(source => this.renderSource({source, userAdded: false}))}
                        {dependencyImageLayerSources.map(source => this.renderSource({source, userAdded: false, renamable: true}))}
                        {additionalImageLayerSources.map(source => this.renderSource({source, userAdded: true}))}
                        {additionalFeatureLayerSources.map(source => this.renderFeatureSource(source))}
                    </Layout>
                </Padding>
                {this.renderDeleteConfirmation()}
            </Scrollable>
        )
    }

    renderFeatureSource(source) {
        const {recipeId, onEdit} = this.props
        const {sourceConfig: {label, asset} = {}} = source
        const description = assetDisplayLabel({label, asset})
        // Feature sources render last and aren't draggable (no drag$). Match the image source rows: keep the short
        // source type on the first line and let the user-facing asset name wrap on the second line without
        // displacing the actions.
        return source && source.id
            ? (
                <ListItem key={source.id}>
                    <div className={styles.featureSource}>
                        <CrudItem
                            title={msg(`featureLayerSources.${source.type}.type`)}
                            description={description}
                        />
                        <SourceActions
                            change={isEditableLayerSource(source) && editAction(() => onEdit(source))}
                            remove={this.deleteAction(description, () => removeFeatureLayerSource({sourceId: source.id, recipeId}))}
                        />
                    </div>
                </ListItem>
            )
            : null
    }

    // A source found to name a recipe that no longer exists is marked, saying which, and left to be edited or removed. A
    // saved source of an image the recipe no longer reads, kept because an area shows it, says so. A source the layout
    // added is edited in the form that added it; one derived from the recipe's inputs, or kept from them, is renamed.
    renderSource({source, userAdded, renamable}) {
        const {drag$, recipe, imageLayerSources, legacyImageLayerSourceIds = [], onEdit, onRename} = this.props
        const description = layerSourceDescription({recipe, source})
        const missing = missingImageLayerSources(recipe, imageLayerSources).some(({id}) => id === source?.id)
        const legacy = legacyImageLayerSourceIds.includes(source?.id)
        const editable = userAdded && isEditableLayerSource(source)
        const change = editable
            ? editAction(() => onEdit(source))
            : (renamable || legacy) && onRename && renameAction(() => onRename(source))
        return source && source.id
            ? (
                <ListItem
                    key={source.id}
                    error={missing}
                    drag$={drag$}
                    dragValue={{
                        id: uuid(),
                        imageLayer: {sourceId: source.id},
                        featureLayers: []
                    }}>
                    <ActionsWithoutDrag className={userAdded ? styles.removableImageSource : styles.imageSource}>
                        <CrudItem
                            key={source.id}
                            title={msg(`imageLayerSources.${source.type}.label`)}
                            titleTooltip={missing ? missingSourceMessage(source, description) : legacy ? msg('map.layout.legacySource') : null}
                            description={description}
                        />
                        <SourceActions
                            change={change}
                            remove={userAdded
                                ? this.deleteAction(description, () => this.removeSource(source.id))
                                : change && ownedDeleteAction()}
                        />
                    </ActionsWithoutDrag>
                </ListItem>
            )
            : null
    }

    renderDeleteConfirmation() {
        const {deleting} = this.state
        return deleting
            ? (
                <Confirm
                    title={msg('map.layout.layer.actions.delete')}
                    message={msg('map.layout.layer.delete.confirmation', {description: deleting.description})}
                    label={msg('map.layout.layer.actions.delete')}
                    onConfirm={() => {
                        this.setState({deleting: null})
                        deleting.remove()
                    }}
                    onCancel={() => this.setState({deleting: null})}
                />
            )
            : null
    }

    deleteAction(description, remove) {
        return {
            value: 'delete',
            label: msg('map.layout.layer.actions.delete'),
            onSelect: () => this.setState({deleting: {description, remove}})
        }
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

const editAction = onSelect => ({value: 'edit', label: msg('map.layout.layer.actions.edit'), onSelect})

const renameAction = onSelect => ({value: 'rename', label: msg('map.layout.layer.actions.rename'), onSelect})

const ownedDeleteAction = () => ({
    value: 'delete',
    label: msg('map.layout.layer.actions.delete'),
    tooltip: msg('map.layout.layer.actions.deleteOwned'),
    disabled: true
})

// The row's actions, opened from one button in a slot as wide on every row.
const SourceActions = ({change, remove}) => {
    const offered = [change, remove].filter(Boolean)
    return (
        <div className={styles.actions}>
            {offered.length
                ? (
                    <ButtonSelect
                        chromeless
                        shape='circle'
                        icon='ellipsis-vertical'
                        noChevron
                        hPlacement='over-left'
                        ariaLabel={msg('map.layout.layer.actions.label')}
                        tooltip={msg('map.layout.layer.actions.label')}
                        options={offered}
                    />
                )
                : null}
        </div>
    )
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
    const remaining = removeAreaBySource(areas, sourceId)
    const named = !!layerSourceName(select(recipePath(recipeId)), sourceId)
    const actionBuilder = recipeActionBuilder(recipeId)
    actionBuilder('REMOVE_IMAGE_LAYER_SOURCE')
        .set('layers.additionalImageLayerSources', imageLayerSourcesForAreas({recipeId, areas: remaining})
            .filter(({id}) => id !== sourceId))
        .set('layers.areas', remaining)
        .del(layerSourceNamePath(sourceId), named)
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
        .set('layers.additionalImageLayerSources', imageLayerSourcesForAreas({recipeId, areas: updatedAreas}))
        .dispatch()
}

export const ImageLayerSources = compose(
    _ImageLayerSources,
    withLayers(),
    withRecipe(recipe => ({recipe}))
)

ImageLayerSources.propTypes = {
    drag$: PropTypes.object,
    onEdit: PropTypes.func,
    onRename: PropTypes.func
}
