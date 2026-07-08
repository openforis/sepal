import PropTypes from 'prop-types'
import React from 'react'
import {filter, map, Subject, switchMap, takeUntil} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {CrudItem} from '~/widget/crudItem'
import {FloatingBox} from '~/widget/floatingBox'
import {Keybinding} from '~/widget/keybinding'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Panel} from '~/widget/panel/panel'
import {ScrubControl} from '~/widget/scrubControl'

import {getImageLayerSource} from '../body/process/imageLayerSourceRegistry'
import {recipePath} from '../body/process/recipe'
import {withRecipe} from '../body/process/recipeContext'
import {withLayers} from '../body/process/withLayers'
import {reorderAssetsByPointer, splitOverlayRowsForMenu, withFeatureLayerDisabled, withReorderedAssets} from './featureLayerOrder'
import {resolveFeatureLayerStyle, withUpdatedOpacity} from './featureLayerStyle'
import styles from './mapAreaMenu.module.css'

class _MapAreaMenuPanel extends React.Component {
    assetsRef = React.createRef()
    assetRowRefs = {}
    drag$ = new Subject()

    // In-list reorder for asset overlays (built-ins are not draggable). ListItem emits drag events on
    // drag$; we capture each asset row's center at drag start and compute the new order from the pointer,
    // persisting on release. No live list preview - ListItem's own drag clone is the feedback.
    componentDidMount() {
        const {addSubscription} = this.props
        const release$ = this.drag$.pipe(filter(({dragging}) => dragging === false))
        const start$ = this.drag$.pipe(filter(({dragging}) => dragging === true))
        const move$ = start$.pipe(
            switchMap(({value}) =>
                this.drag$.pipe(
                    takeUntil(release$),
                    map(({coords}) => coords),
                    filter(Boolean),
                    map(coords => ({sourceId: value, coords}))
                )
            )
        )
        addSubscription(
            start$.subscribe(({value}) => this.onAssetDragStart(value)),
            move$.subscribe(({sourceId, coords}) => this.onAssetDragMove(sourceId, coords)),
            release$.subscribe(() => this.onAssetDragEnd())
        )
    }

    render() {
        const {element, activatable: {deactivate}} = this.props
        return (
            <FloatingBox
                element={element}
                vPlacement='above-or-below'
                hPlacement='center'
                onBlur={deactivate}
            >
                <Panel
                    className={styles.panel}
                    placement='inline'>
                    <Panel.Header>
                        {this.getImageLayerSourceDescription()}
                    </Panel.Header>
                    <Panel.Content>
                        <Layout>
                            {this.renderImageLayerForm()}
                            {this.renderOverlays()}
                        </Layout>
                    </Panel.Content>
                    <Keybinding keymap={{'Escape': deactivate}}/>
                </Panel>
            </FloatingBox>
        )
    }

    getImageLayerSourceDescription() {
        const {imageLayerSources, layers: {areas}, area, recipe} = this.props
        const {imageLayer} = areas[area]

        const source = imageLayerSources.find(({id}) => id === imageLayer.sourceId)
        const {description} = getImageLayerSource({recipe, source})
        return (
            <div>{description}</div>
        )
    }

    renderImageLayerForm() {
        const {form} = this.props
        return form
    }

    // Overlay selector: the popup no longer mirrors the map draw order. It groups the fixed built-in overlays
    // (enable/disable only) first, then the draggable EE table asset overlays as one list at the bottom, so a
    // built-in like Legend never appears below user-added asset rows. Each group keeps its persisted relative
    // order; the persisted featureLayers order and map draw order are unchanged.
    renderOverlays() {
        const rows = this.overlayRows()
        if (!rows.length) {
            return null
        }
        const {builtInRows, assetRows} = splitOverlayRowsForMenu(rows)
        return (
            <Layout type='vertical' spacing='none'>
                {builtInRows.map(row => this.renderBuiltInOverlay(row))}
                {this.renderAssetOverlays(assetRows)}
            </Layout>
        )
    }

    overlayRows() {
        const {featureLayerSources, area, layers: {areas}} = this.props
        const featureLayers = (areas[area] && areas[area].featureLayers) || []
        return featureLayers
            .map(featureLayer => {
                const source = featureLayerSources.find(({id}) => id === featureLayer.sourceId)
                return source
                    ? {featureLayer, source, orderable: source.type === 'EETableAsset'}
                    : null
            })
            .filter(Boolean)
    }

    // Non-draggable ListItem: no drag$, so no handle (matches the image layer source list's standard rows).
    renderBuiltInOverlay({featureLayer, source}) {
        return (
            <ListItem key={source.id}>
                {this.renderOverlayItem(featureLayer, source)}
            </ListItem>
        )
    }

    renderAssetOverlays(assets) {
        if (!assets.length) {
            return null
        }
        return (
            <div ref={this.assetsRef}>
                {assets.map(row => this.renderAssetOverlay(row))}
            </div>
        )
    }

    // Draggable ListItem: drag$/dragValue render the standard ListItem handle inside the row. Row actions are
    // the compact opacity scrub control followed by the Layer options button; other detailed style controls
    // live in the options modal.
    renderAssetOverlay({featureLayer, source}) {
        return (
            <div key={source.id} ref={element => this.setAssetRowRef(source.id, element)}>
                <ListItem drag$={this.drag$} dragValue={source.id}>
                    {this.renderOverlayItem(featureLayer, source, [
                        this.renderOpacityControl(featureLayer, source),
                        this.renderOptionsButton(source)
                    ])}
                </ListItem>
            </div>
        )
    }

    renderOpacityControl(featureLayer, source) {
        const {opacity} = resolveFeatureLayerStyle({layerConfig: featureLayer.layerConfig, source})
        // Generic scrub control configured for 0..1 layer opacity: bare 0-100 row text and a 0<->100 toggle
        // (the ScrubControl min/max default). Preview restyles the live tiles; change persists style.opacity.
        return (
            <ScrubControl
                key='opacity'
                value={opacity}
                formatValue={value => Math.round(value * 100)}
                tooltip={value => msg('map.featureLayerStyle.opacityControl.tooltip', {percent: Math.round(value * 100)})}
                onPreview={value => this.previewOverlayOpacity(source, value)}
                onChange={value => this.setOverlayOpacity(featureLayer, source, value)}
            />
        )
    }

    // Live, client-side-only opacity feedback while scrubbing: restyle the mounted tiles via the existing map
    // layer instance. No Redux dispatch and no eeTableMap$/tile refetch. No-op if the layer isn't mounted
    // (e.g. hidden overlay); the persisted value is still written on release by setOverlayOpacity.
    previewOverlayOpacity(source, opacity) {
        const {map} = this.props
        map?.getLayer(source.id)?.setOpacity?.(opacity)
    }

    renderOverlayItem(featureLayer, source, inlineComponents) {
        return (
            <CrudItem
                title={this.overlayLabel(source)}
                selected={featureLayer.disabled !== true}
                selectTooltip={this.overlayLabel(source)}
                onSelect={enabled => this.toggleOverlay(source.id, enabled)}
                inlineComponents={inlineComponents}
            />
        )
    }

    renderOptionsButton(source) {
        return (
            <Button
                key='options'
                chromeless
                shape='circle'
                size='small'
                icon='cog'
                tooltip={msg('map.featureLayerStyle.tooltip')}
                onClick={() => this.openOptions(source)}
            />
        )
    }

    overlayLabel(source) {
        return source.type === 'EETableAsset'
            ? source.sourceConfig?.label || source.sourceConfig?.asset
            : msg(`featureLayerSources.${source.type}.type`)
    }

    openOptions(source) {
        const {activatable: {deactivate}, activator: {activatables: {featureLayerOptions}}} = this.props
        featureLayerOptions.activate({source})
        deactivate()
    }

    toggleOverlay(sourceId, enabled) {
        const {recipeId, area, layers: {areas}} = this.props
        const featureLayers = (areas[area] && areas[area].featureLayers) || []
        actionBuilder('TOGGLE_FEATURE_LAYER', {sourceId, area})
            .set(
                [recipePath(recipeId), 'layers.areas', area, 'featureLayers'],
                withFeatureLayerDisabled(featureLayers, sourceId, !enabled)
            )
            .dispatch()
    }

    // Persist a row-level opacity change (committed once on pointer release, not per move). Writes the full
    // resolved style with the new opacity so other style fields are preserved, matching how the options modal
    // persists. EETableAsset opacity is applied client-side by the map layer, so this doesn't refetch tiles.
    setOverlayOpacity(featureLayer, source, opacity) {
        const {recipeId, area} = this.props
        actionBuilder('SET_FEATURE_LAYER_OPACITY', {sourceId: source.id, area})
            .set(
                [recipePath(recipeId), 'layers.areas', area, 'featureLayers', {sourceId: source.id}, 'layerConfig.style'],
                withUpdatedOpacity({layerConfig: featureLayer.layerConfig, source, opacity})
            )
            .dispatch()
    }

    setAssetRowRef(sourceId, element) {
        if (element) {
            this.assetRowRefs[sourceId] = element
        } else {
            delete this.assetRowRefs[sourceId]
        }
    }

    onAssetDragStart(draggedId) {
        this.draggedId = draggedId
        this.dragStartOrder = this.assetOrder()
        this.pendingOrder = this.dragStartOrder
        this.assetCenters = this.measureAssetCenters()
        this.listRect = this.assetsRef.current?.getBoundingClientRect()
    }

    onAssetDragMove(draggedId, coords) {
        if (this.draggedId !== draggedId) {
            return
        }
        const inside = this.listRect && coords.y >= this.listRect.top && coords.y <= this.listRect.bottom
        this.pendingOrder = reorderAssetsByPointer({
            assetIds: this.dragStartOrder,
            draggedId,
            pointerY: inside ? coords.y : null,
            centers: this.assetCenters
        })
    }

    onAssetDragEnd() {
        if (this.draggedId == null) {
            return
        }
        const {pendingOrder, dragStartOrder} = this
        this.draggedId = this.assetCenters = this.listRect = null
        if (pendingOrder.join('\0') !== dragStartOrder.join('\0')) {
            this.persistAssetOrder(pendingOrder)
        }
    }

    persistAssetOrder(orderedAssetIds) {
        const {recipeId, area, featureLayerSources, layers: {areas}} = this.props
        const featureLayers = (areas[area] && areas[area].featureLayers) || []
        const assetSourceIds = featureLayerSources.filter(({type}) => type === 'EETableAsset').map(({id}) => id)
        actionBuilder('REORDER_FEATURE_LAYERS', {area})
            .set(
                [recipePath(recipeId), 'layers.areas', area, 'featureLayers'],
                withReorderedAssets(featureLayers, assetSourceIds, orderedAssetIds)
            )
            .dispatch()
    }

    assetOrder() {
        return this.overlayRows().filter(({orderable}) => orderable).map(({source}) => source.id)
    }

    measureAssetCenters() {
        const centers = {}
        Object.entries(this.assetRowRefs).forEach(([sourceId, element]) => {
            const {top, bottom} = element.getBoundingClientRect()
            centers[sourceId] = (top + bottom) / 2
        })
        return centers
    }
}

const policy = () => ({
    _: 'allow'
})

const MapAreaMenuPanel = compose(
    _MapAreaMenuPanel,
    withLayers(),
    withRecipe(recipe => ({recipe})),
    withSubscriptions(),
    withActivators({
        featureLayerOptions: ({area}) => `featureLayerOptions-${area}`
    }),
    withActivatable({
        id: ({area}) => `mapAreaMenu-${area}`,
        policy,
        alwaysAllow: true
    })
)

class _MapAreaMenu extends React.Component {
    ref = React.createRef()

    render() {
        return (
            <div className={styles.container}>
                {this.renderPanel()}
                {this.renderButton()}
            </div>
        )
    }

    renderButton() {
        const {activator: {activatables: {mapAreaMenu: {active, canActivate, toggle}}}} = this.props
        return (
            <div className={styles.buttonContainer} ref={this.ref}>
                <Button
                    look='default'
                    shape='pill'
                    icon='bars'
                    disabled={!canActivate && !active}
                    tooltip={this.getImageLayerSourceDescription()}
                    tooltipDisabled={active}
                    onClick={toggle}
                />
            </div>
        )
    }

    renderPanel() {
        const {area, form, map} = this.props
        return (
            <MapAreaMenuPanel area={area} form={form} map={map} element={this.ref.current}/>
        )
    }

    getImageLayerSourceDescription() {
        const {imageLayerSources, layers: {areas}, area, recipe} = this.props
        const {imageLayer} = areas[area]

        const source = imageLayerSources.find(({id}) => id === imageLayer.sourceId)
        const {description} = getImageLayerSource({recipe, source})
        return (
            <CrudItem title={msg(`imageLayerSources.${source.type}.label`)} description={description}/>
        )
    }

}

export const MapAreaMenu = compose(
    _MapAreaMenu,
    withActivators({
        mapAreaMenu: ({area}) => `mapAreaMenu-${area}`
    }),
    withLayers(),
    withRecipe(recipe => ({recipe}))
)

MapAreaMenu.propTypes = {
    area: PropTypes.string,
    form: PropTypes.object,
    map: PropTypes.object
}
