import React from 'react'

import api from '~/apiRegistry'
import {parseFeatureLayerAssetStyle, parseFeatureLayerCategoricalProperties} from '~/app/home/map/featureLayerAssetStyleParser'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../recipeContext'
import {defaultAssetLabel, resolveAssetLabel} from './assetLabel'
import {reconcileFeatureLayerConfig, updateLayerSource, withSourceValues} from './layerSourceEdit'
import styles from './selectAsset.module.css'

const fields = {
    asset: new Form.Field().notBlank(),
    label: new Form.Field()
}

// EE FeatureCollection/table assets report their type as 'Table'.
const isFeatureCollection = metadata => metadata?.type === 'Table'

// Opened with a `source` to edit, the form starts from that source and offers only assets of its kind: an image source
// stays an image, a table source a table.
class _SelectAsset extends React.Component {
    state = {
        loadedAsset: false,
        asset: null,
        metadata: null,
        visualizations: null,
        tableColumns: null,
        columnsLoading: false
    }

    constructor(props) {
        super(props)
        this.add = this.add.bind(this)
        this.apply = this.apply.bind(this)
        this.onLoading = this.onLoading.bind(this)
        this.onLoaded = this.onLoaded.bind(this)
        // The source's own label is the user's for its asset, kept while that asset loads.
        this.labeledAsset = props.activatable.source?.sourceConfig.asset
    }

    render() {
        const {activatable: {deactivate, source}} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header title={source
                    ? msg('map.layout.editImageLayerSource.types.Asset.description')
                    : msg('map.layout.addImageLayerSource.types.Asset.description')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        {this.renderConfirmButton()}
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderConfirmButton() {
        const {activatable: {source}} = this.props
        const {loadedAsset, columnsLoading} = this.state
        const disabled = !loadedAsset || columnsLoading
        return source
            ? <Panel.Buttons.Apply disabled={disabled} keybinding='Enter' onClick={this.apply}/>
            : <Panel.Buttons.Add disabled={disabled} keybinding='Enter' onClick={this.add}/>
    }

    renderContent() {
        const {inputs: {asset, label}, activatable: {source}} = this.props
        const {loadedAsset} = this.state
        return (
            <Layout type='vertical'>
                <Form.AssetCombo
                    input={asset}
                    label={msg('map.layout.addImageLayerSource.types.Asset.form.asset.label')}
                    autoFocus
                    allowedTypes={allowedTypes(source)}
                    onLoading={this.onLoading}
                    onLoaded={this.onLoaded}
                />
                {/* Rendered from the start, so the panel keeps its size when the asset's metadata arrives. */}
                <Form.Input
                    input={label}
                    label={msg('map.layout.addImageLayerSource.types.Asset.form.label.label')}
                    placeholder={msg('map.layout.addImageLayerSource.types.Asset.form.label.placeholder')}
                    disabled={!loadedAsset}
                />
            </Layout>
        )
    }

    onLoading() {
        // Invalidate any in-flight column request from a previously selected asset.
        this.requestedColumnsAsset = null
        this.setState({
            loadedAsset: false,
            asset: null,
            metadata: null,
            visualizations: null,
            tableColumns: null,
            columnsLoading: false
        })
    }

    onLoaded({asset, metadata, visualizations}) {
        const {inputs: {label}} = this.props
        // Prefill the label from the asset's default; keep a user's edit only when the same asset reloads.
        const nextLabel = resolveAssetLabel({
            current: label.value,
            asset,
            labeledAsset: this.labeledAsset,
            defaultLabel: defaultAssetLabel(asset, metadata)
        })
        if (nextLabel !== label.value) {
            label.set(nextLabel)
        }
        this.labeledAsset = asset
        const featureCollection = isFeatureCollection(metadata)
        if (featureCollection) {
            this.loadColumns(asset)
        }
        // Block Add for tables until columns resolve, so the color-column default isn't bypassed.
        this.setState({loadedAsset: true, asset, metadata, visualizations, columnsLoading: featureCollection})
    }

    // Discover feature properties so we can default to color-property mode when the table carries a 'color'
    // property (e.g. Sampling Design exports). Guarded by the requested asset so a stale response from a
    // previously selected asset can't overwrite the current one.
    loadColumns(asset) {
        const {addSubscription} = this.props
        this.requestedColumnsAsset = asset
        addSubscription(
            api.gee.loadEETableColumns$(asset).subscribe({
                next: tableColumns => asset === this.requestedColumnsAsset && this.setState({tableColumns, columnsLoading: false}),
                error: () => asset === this.requestedColumnsAsset && this.setState({tableColumns: [], columnsLoading: false})
            })
        )
    }

    add() {
        const {metadata} = this.state
        const {recipeActionBuilder, activatable: {deactivate}} = this.props
        if (isFeatureCollection(metadata)) {
            recipeActionBuilder('ADD_EE_TABLE_FEATURE_LAYER_SOURCE')
                .push('layers.additionalFeatureLayerSources', {
                    id: `ee-table:${uuid()}`,
                    type: 'EETableAsset',
                    defaultEnabled: false,
                    sourceConfig: this.featureSourceConfig()
                })
                .dispatch()
        } else {
            recipeActionBuilder('ADD_ASSET_IMAGE_LAYER_SOURCE')
                .push('layers.additionalImageLayerSources', {
                    id: uuid(),
                    type: 'Asset',
                    sourceConfig: this.imageSourceConfig()
                })
                .dispatch()
        }
        deactivate()
    }

    // An image's visualizations are reconciled by its layer in each area. A table's style and filter name its
    // properties, so another table keeps only those it can still apply.
    apply() {
        const {asset, metadata, tableColumns} = this.state
        const {recipeId, activatable: {deactivate, source}} = this.props
        const sameAsset = asset === source.sourceConfig.asset
        updateLayerSource({
            recipeId,
            sourceId: source.id,
            ...(isFeatureCollection(metadata)
                ? {
                    sourceConfig: this.featureSourceConfig(),
                    reconcileLayerConfig: sameAsset ? undefined : reconcileFeatureLayerConfig(tableColumns || [])
                }
                : {sourceConfig: this.imageSourceConfig()})
        })
        deactivate()
    }

    imageSourceConfig() {
        const {asset, metadata, visualizations} = this.state
        return {
            description: asset,
            asset,
            label: this.assetLabel(),
            metadata,
            visualizations
        }
    }

    featureSourceConfig() {
        const {asset, metadata, tableColumns} = this.state
        // Persist the schema; the color-property default is derived from it in resolveFeatureLayerStyle.
        const columns = Array.isArray(tableColumns) ? tableColumns : []
        // A categorical "By value" style parsed from the asset's `<property>_class_*` metadata (e.g.
        // Sampling Design's stratum_class_values/palette) becomes the source default, outranking the
        // color-column heuristic. Null when the asset carries no such convention.
        const defaultStyle = parseFeatureLayerAssetStyle({properties: metadata?.properties, columns})
        // Presentation-only categorical metadata (values, colors, optional labels) for every categorical
        // property, kept out of defaultStyle so labels never reach the EE styling job. Drives the Filter
        // categorical Combo and the By-value label column.
        const categoricalProperties = parseFeatureLayerCategoricalProperties({properties: metadata?.properties, columns})
        return {
            asset,
            label: this.assetLabel(),
            description: asset,
            columns,
            ...(defaultStyle ? {defaultStyle} : {}),
            ...(Object.keys(categoricalProperties).length ? {categoricalProperties} : {})
        }
    }

    assetLabel() {
        const {asset, metadata} = this.state
        const {inputs: {label}} = this.props
        return label.value || defaultAssetLabel(asset, metadata)
    }
}

const sourceValues = ({sourceConfig: {asset, label}}) => ({
    asset,
    label: label || ''
})

const allowedTypes = source =>
    !source
        ? ['Image', 'ImageCollection', 'Table']
        : source.type === 'EETableAsset' ? ['Table'] : ['Image', 'ImageCollection']

const policy = () => ({
    _: 'allow'
})

export const SelectAsset = compose(
    _SelectAsset,
    withForm({fields}),
    withSourceValues(sourceValues),
    withRecipe(),
    withSubscriptions(),
    withActivatable({id: 'selectAsset', policy, alwaysAllow: true})
)
