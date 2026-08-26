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
import {assetDisplayLabel} from '../body/process/mapLayout/assetLabel'
import {recipePath} from '../body/process/recipe'
import {withRecipe} from '../body/process/recipeContext'
import {withLayers} from '../body/process/withLayers'
import {resolveAoiStyle, withUpdatedAoiOpacity} from './aoiLayer'
import {isDataFeatureLayer, isPresentationFeatureLayer, reorderDataLayersByPointer, toDisplayedFeatureLayers, toPersistedDataOrder, withFeatureLayerDisabled, withReorderedDataLayers} from './featureLayerOrder'
import {resolveFeatureLayerStyle, withUpdatedOpacity} from './featureLayerStyle'
import styles from './mapAreaMenu.module.css'

// Shared placement for the feature overlay row action cluster, so its tooltips feel consistent.
const OVERLAY_ACTION_TOOLTIP_PLACEMENT = 'right'

const isEnabled = ({disabled}) => disabled !== true

// The disabled Labels scrubber still has to satisfy ScrubControl's required onChange without weakening
// that contract for everyone else.
const NO_OP = () => {}

class _MapAreaMenuPanel extends React.Component {
    overlayListRef = React.createRef()
    dataRowRefs = {}
    drag$ = new Subject()
    state = {dragging: false}

    // In-list reorder for the data band (fixed rows are not draggable). ListItem emits drag events on
    // drag$; we capture each data row's center at drag start and compute the new order from the pointer,
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
            start$.subscribe(({value}) => this.onDataDragStart(value)),
            move$.subscribe(({sourceId, coords}) => this.onDataDragMove(sourceId, coords)),
            release$.subscribe(() => this.onDataDragEnd())
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
                            {this.renderFeatureLayers()}
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

    renderFeatureLayers() {
        const rows = this.stackRows()
        const presentationRow = this.presentationRow()
        if (!rows.length && !presentationRow) {
            return null
        }
        return (
            <Layout type='vertical' spacing='compact'>
                {this.renderPresentationToggle(presentationRow)}
                {this.renderStack(rows)}
            </Layout>
        )
    }

    // Legend, Palette and Values render over the map rather than in it, and at most one of them exists.
    // It gets a toggle of its own, detached from the ordered rows so it cannot imply a stacking position,
    // a handle or settings.
    renderPresentationToggle(row) {
        if (!row) {
            return null
        }
        const {featureLayer, source} = row
        return this.renderVisibilityToggle({
            label: this.overlayLabel(source),
            enabled: isEnabled(featureLayer),
            className: styles.presentationToggle,
            onToggle: () => this.toggleOverlay(source.id, isEnabled(featureLayer))
        })
    }

    // Map order is persisted bottom-to-top; the menu displays top-to-bottom, so its top row is the top
    // map layer.
    renderStack(rows) {
        // A lone data row has nothing to reorder against, so it drops its handle rather than offering a
        // drag that cannot change anything. Disabled rows still count: their position is persisted and
        // matters as soon as they are re-enabled.
        const reorderable = rows.filter(({orderable}) => orderable).length > 1
        return rows.length
            ? (
                <Layout ref={this.overlayListRef} type='vertical' spacing='tight'>
                    {rows.map(row => row.orderable
                        ? this.renderDataOverlay(row, reorderable)
                        : this.renderFixedOverlay(row)
                    )}
                </Layout>
            )
            : null
    }

    stackRows() {
        return this.overlayRows().filter(({source}) => !isPresentationFeatureLayer(source.type))
    }

    presentationRow() {
        return this.overlayRows().find(({source}) => isPresentationFeatureLayer(source.type))
    }

    overlayRows() {
        const {featureLayerSources, area, layers: {areas}} = this.props
        const featureLayers = (areas[area] && areas[area].featureLayers) || []
        return toDisplayedFeatureLayers(featureLayers)
            .map(featureLayer => {
                const source = featureLayerSources.find(({id}) => id === featureLayer.sourceId)
                return source
                    ? {featureLayer, source, orderable: isDataFeatureLayer(source.type)}
                    : null
            })
            .filter(Boolean)
    }

    // Non-draggable ListItem: no drag$, so no handle. The fixedOverlay spacer stands in for the data rows'
    // (narrowed) drag handle width, so fixed labels line up with draggable ones. Fixed does not mean
    // action-free: labels carries the same cluster, and the row heights depend on it.
    renderFixedOverlay({featureLayer, source}) {
        return (
            <ListItem
                key={source.id}
                className={this.rowClassName(featureLayer)}
                onClick={() => this.toggleOverlay(source.id, isEnabled(featureLayer))}>
                <div className={styles.fixedOverlay}>
                    {this.renderOverlayItem(featureLayer, source, this.renderRowActions(featureLayer, source))}
                </div>
            </ListItem>
        )
    }

    // The aoi and the asset overlays form one draggable band and share the same action cluster. They drag
    // only from the handle and toggle from anywhere else in the row. Without a handle the markup is
    // unchanged apart from the handle itself, so a spacer keeps the label aligned.
    renderDataOverlay({featureLayer, source}, reorderable) {
        const dragProps = reorderable
            ? {drag$: this.drag$, dragAxis: 'vertical', dragTarget: 'handle', dragValue: source.id}
            : {}
        return (
            <div key={source.id} ref={element => this.setDataRowRef(source.id, element)}>
                <ListItem
                    {...dragProps}
                    className={this.rowClassName(
                        featureLayer,
                        styles.dataOverlayRow,
                        reorderable ? styles.draggableRow : styles.staticRow
                    )}
                    onClick={() => this.toggleOverlay(source.id, isEnabled(featureLayer))}>
                    {this.renderOverlayItem(featureLayer, source, this.renderRowActions(featureLayer, source))}
                </ListItem>
            </div>
        )
    }

    rowClassName(featureLayer, ...rowStyles) {
        return [styles.overlayRow, ...rowStyles, isEnabled(featureLayer) ? null : styles.overlayDisabled]
            .filter(Boolean)
            .join(' ')
    }

    // Row actions are a per-type capability of this menu. Aoi and asset rows own the layer they render, so
    // their scrubber is live. Labels renders through a Google StyledMapType, which exposes no opacity
    // control, so its scrubber is present for row symmetry but fixed and inert. Scene areas and reference
    // data have no actions yet.
    renderRowActions(featureLayer, source) {
        switch (source.type) {
            case 'Aoi':
            case 'EETableAsset':
                return [this.renderOptionsButton(source), this.renderOpacityControl(featureLayer, source)]
            case 'Labels':
                return [this.renderOptionsButton(source), this.renderFixedOpacityControl()]
            default:
                return null
        }
    }

    // Deliberately routed around resolveRowOpacity/styleWithOpacity: labels has no persisted opacity, and
    // this control neither previews, dispatches nor writes.
    renderFixedOpacityControl() {
        return (
            <ScrubControl
                key='opacity'
                value={1}
                disabled
                formatValue={value => Math.round(value * 100)}
                tooltip={msg('map.labelsLayerStyle.opacity.fixed')}
                tooltipPlacement={OVERLAY_ACTION_TOOLTIP_PLACEMENT}
                onChange={NO_OP}
            />
        )
    }

    resolveRowOpacity(featureLayer, source) {
        return source.type === 'Aoi'
            ? resolveAoiStyle(featureLayer.layerConfig).opacity
            : resolveFeatureLayerStyle({layerConfig: featureLayer.layerConfig, source}).opacity
    }

    styleWithOpacity(featureLayer, source, opacity) {
        return source.type === 'Aoi'
            ? withUpdatedAoiOpacity(featureLayer.layerConfig, opacity)
            : withUpdatedOpacity({layerConfig: featureLayer.layerConfig, source, opacity})
    }

    optionsActivatable(source) {
        const {activator: {activatables}} = this.props
        switch (source.type) {
            case 'Aoi': return activatables.aoiLayerOptions
            case 'Labels': return activatables.labelsLayerOptions
            default: return activatables.featureLayerOptions
        }
    }

    renderOpacityControl(featureLayer, source) {
        const opacity = this.resolveRowOpacity(featureLayer, source)
        // Generic scrub control configured for 0..1 layer opacity: bare 0-100 row text and a 0<->100 toggle
        // (the ScrubControl min/max default). Preview restyles the live tiles; change persists style.opacity.
        return (
            <ScrubControl
                key='opacity'
                value={opacity}
                formatValue={value => Math.round(value * 100)}
                tooltip={value => msg('map.featureLayerStyle.opacityControl.tooltip', {percent: Math.round(value * 100)})}
                tooltipPlacement={OVERLAY_ACTION_TOOLTIP_PLACEMENT}
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
        const label = this.overlayLabel(source)
        return (
            <CrudItem
                title={this.renderVisibilityToggle({
                    label,
                    enabled: isEnabled(featureLayer),
                    className: styles.overlayLabelButton,
                    onToggle: () => this.toggleOverlay(source.id, isEnabled(featureLayer))
                })}
                titleClassName={styles.overlayTitle}
                titleTooltip={label}
                titleTooltipDisabled={this.state.dragging}
                titleTooltipPlacement='top'
                tooltipPlacement={OVERLAY_ACTION_TOOLTIP_PLACEMENT}
                inlineComponents={inlineComponents}
            />
        )
    }

    // The visibility control, map-local on purpose: the shared ListItem cannot become a button because
    // these rows contain nested buttons. A real button gives keyboard operation and an announced on/off
    // state; the rest of the row stays pointer-clickable through ListItem's own onClick, so the click has
    // to stop here rather than toggling a second time on the way out.
    renderVisibilityToggle({label, enabled, className, onToggle}) {
        return (
            <button
                type='button'
                className={className}
                aria-pressed={enabled}
                onClick={e => {
                    e.stopPropagation()
                    onToggle()
                }}>
                {label}
            </button>
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
                tooltipPlacement={OVERLAY_ACTION_TOOLTIP_PLACEMENT}
                onClick={() => this.openOptions(source)}
            />
        )
    }

    overlayLabel(source) {
        return source.type === 'EETableAsset'
            ? assetDisplayLabel({label: source.sourceConfig?.label, asset: source.sourceConfig?.asset})
            : msg(`featureLayerSources.${source.type}.type`)
    }

    openOptions(source) {
        const {activatable: {deactivate}} = this.props
        this.optionsActivatable(source).activate({source})
        deactivate()
    }

    toggleOverlay(sourceId, enabled) {
        const {recipeId, area, layers: {areas}} = this.props
        const featureLayers = (areas[area] && areas[area].featureLayers) || []
        actionBuilder('TOGGLE_FEATURE_LAYER', {sourceId, area})
            .set(
                [recipePath(recipeId), 'layers.areas', area, 'featureLayers'],
                withFeatureLayerDisabled(featureLayers, sourceId, enabled)
            )
            .dispatch()
    }

    // Persist a row-level opacity change (committed once on pointer release, not per move). Writes the full
    // resolved style with the new opacity so other style fields are preserved, matching how the options modal
    // persists. Both tile-backed data layers apply opacity client-side, so this doesn't refetch tiles.
    setOverlayOpacity(featureLayer, source, opacity) {
        const {recipeId, area} = this.props
        actionBuilder('SET_FEATURE_LAYER_OPACITY', {sourceId: source.id, area})
            .set(
                [recipePath(recipeId), 'layers.areas', area, 'featureLayers', {sourceId: source.id}, 'layerConfig.style'],
                this.styleWithOpacity(featureLayer, source, opacity)
            )
            .dispatch()
    }

    setDataRowRef(sourceId, element) {
        if (element) {
            this.dataRowRefs[sourceId] = element
        } else {
            delete this.dataRowRefs[sourceId]
        }
    }

    onDataDragStart(draggedId) {
        this.draggedId = draggedId
        this.dragStartOrder = this.dataOrder()
        this.pendingOrder = this.dragStartOrder
        this.dataRowCenters = this.measureDataRowCenters()
        // Bounds deliberately span the whole overlay list, not just the data band: dragging over a fixed
        // row still counts as inside, and reorderDataLayersByPointer clamps to the band.
        this.listRect = this.overlayListRef.current?.getBoundingClientRect()
        // Suppress the label tooltip while dragging so it can't linger over the moving row.
        this.setState({dragging: true})
    }

    onDataDragMove(draggedId, coords) {
        if (this.draggedId !== draggedId) {
            return
        }
        const inside = this.listRect && coords.y >= this.listRect.top && coords.y <= this.listRect.bottom
        this.pendingOrder = reorderDataLayersByPointer({
            dataIds: this.dragStartOrder,
            draggedId,
            pointerY: inside ? coords.y : null,
            centers: this.dataRowCenters
        })
    }

    onDataDragEnd() {
        this.setState({dragging: false})
        if (this.draggedId == null) {
            return
        }
        const {pendingOrder, dragStartOrder} = this
        this.draggedId = this.dataRowCenters = this.listRect = null
        if (pendingOrder.join('\0') !== dragStartOrder.join('\0')) {
            this.persistDataOrder(pendingOrder)
        }
    }

    persistDataOrder(orderedDataIds) {
        const {recipeId, area, featureLayerSources, layers: {areas}} = this.props
        const featureLayers = (areas[area] && areas[area].featureLayers) || []
        const dataSourceIds = featureLayerSources.filter(({type}) => isDataFeatureLayer(type)).map(({id}) => id)
        actionBuilder('REORDER_FEATURE_LAYERS', {area})
            .set(
                [recipePath(recipeId), 'layers.areas', area, 'featureLayers'],
                withReorderedDataLayers(featureLayers, dataSourceIds, toPersistedDataOrder(orderedDataIds))
            )
            .dispatch()
    }

    dataOrder() {
        return this.stackRows().filter(({orderable}) => orderable).map(({source}) => source.id)
    }

    measureDataRowCenters() {
        const centers = {}
        Object.entries(this.dataRowRefs).forEach(([sourceId, element]) => {
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
        aoiLayerOptions: ({area}) => `aoiLayerOptions-${area}`,
        featureLayerOptions: ({area}) => `featureLayerOptions-${area}`,
        labelsLayerOptions: ({area}) => `labelsLayerOptions-${area}`
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
