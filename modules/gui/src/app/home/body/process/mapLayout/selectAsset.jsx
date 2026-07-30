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
import styles from './selectAsset.module.css'

const fields = {
    asset: new Form.Field().notBlank(),
    label: new Form.Field()
}

// EE FeatureCollection/table assets report their type as 'Table'.
const isFeatureCollection = metadata => metadata?.type === 'Table'

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
        this.onLoading = this.onLoading.bind(this)
        this.onLoaded = this.onLoaded.bind(this)
    }

    render() {
        const {activatable: {deactivate}} = this.props
        const {loadedAsset, columnsLoading} = this.state
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header title={msg('map.layout.addImageLayerSource.types.Asset.description')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        <Panel.Buttons.Add
                            disabled={!loadedAsset || columnsLoading}
                            keybinding='Enter'
                            onClick={this.add}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderContent() {
        const {inputs: {asset, label}} = this.props
        const {loadedAsset} = this.state
        return (
            <Layout type='vertical'>
                <Form.AssetCombo
                    input={asset}
                    label={msg('map.layout.addImageLayerSource.types.Asset.form.asset.label')}
                    autoFocus
                    allowedTypes={['Image', 'ImageCollection', 'Table']}
                    onLoading={this.onLoading}
                    onLoaded={this.onLoaded}
                />
                {loadedAsset
                    ? (
                        <Form.Input
                            input={label}
                            label={msg('map.layout.addImageLayerSource.types.Asset.form.label.label')}
                            placeholder={msg('map.layout.addImageLayerSource.types.Asset.form.label.placeholder')}
                        />
                    )
                    : null}
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
        const {asset, metadata, visualizations, tableColumns} = this.state
        const {inputs: {label}, recipeActionBuilder, activatable: {deactivate}} = this.props
        const assetLabel = label.value || defaultAssetLabel(asset, metadata)
        if (isFeatureCollection(metadata)) {
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
            recipeActionBuilder('ADD_EE_TABLE_FEATURE_LAYER_SOURCE')
                .push('layers.additionalFeatureLayerSources', {
                    id: `ee-table:${uuid()}`,
                    type: 'EETableAsset',
                    defaultEnabled: false,
                    sourceConfig: {
                        asset,
                        label: assetLabel,
                        description: asset,
                        columns,
                        ...(defaultStyle ? {defaultStyle} : {}),
                        ...(Object.keys(categoricalProperties).length ? {categoricalProperties} : {})
                    }
                })
                .dispatch()
        } else {
            recipeActionBuilder('ADD_ASSET_IMAGE_LAYER_SOURCE')
                .push('layers.additionalImageLayerSources', {
                    id: uuid(),
                    type: 'Asset',
                    sourceConfig: {
                        description: asset,
                        asset,
                        label: assetLabel,
                        metadata,
                        visualizations
                    }
                })
                .dispatch()
        }
        deactivate()
    }
}

const policy = () => ({
    _: 'allow'
})

export const SelectAsset = compose(
    _SelectAsset,
    withForm({fields}),
    withRecipe(),
    withSubscriptions(),
    withActivatable({id: 'selectAsset', policy, alwaysAllow: true})
)
