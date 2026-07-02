import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../recipeContext'
import styles from './selectAsset.module.css'

const fields = {
    asset: new Form.Field().notBlank(),
    label: new Form.Field()
}

// EE FeatureCollection/table assets report their type as 'Table'.
const isFeatureCollection = metadata => metadata?.type === 'Table'

const assetBasename = asset => asset.substring(asset.lastIndexOf('/') + 1)

const defaultLabel = (asset, metadata) => {
    const properties = metadata?.properties || {}
    return properties['system:title'] || metadata?.title || assetBasename(asset)
}

class _SelectAsset extends React.Component {
    state = {
        loadedAsset: false,
        asset: null,
        metadata: null,
        visualizations: null
    }

    constructor(props) {
        super(props)
        this.add = this.add.bind(this)
        this.onLoading = this.onLoading.bind(this)
        this.onLoaded = this.onLoaded.bind(this)

    }

    render() {
        const {activatable: {deactivate}} = this.props
        const {loadedAsset} = this.state
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
                            disabled={!loadedAsset}
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
        const {metadata} = this.state
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
                {isFeatureCollection(metadata)
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
        this.setState({
            loadedAsset: false,
            asset: null,
            metadata: null,
            visualizations: null
        })
    }

    onLoaded({asset, metadata, visualizations}) {
        const {inputs: {label}} = this.props
        // Prefill the label for table assets with the default display label, but don't clobber a user's
        // edit when the same asset is re-selected. Loading a different table asset resets to its default.
        if (isFeatureCollection(metadata) && asset !== this.labeledAsset) {
            this.labeledAsset = asset
            label.set(defaultLabel(asset, metadata))
        }
        this.setState({
            loadedAsset: true,
            asset,
            metadata,
            visualizations
        })
    }

    add() {
        const {asset, metadata, visualizations} = this.state
        const {inputs: {label}, recipeActionBuilder, activatable: {deactivate}} = this.props
        if (isFeatureCollection(metadata)) {
            recipeActionBuilder('ADD_EE_TABLE_FEATURE_LAYER_SOURCE')
                .push('layers.additionalFeatureLayerSources', {
                    id: `ee-table:${uuid()}`,
                    type: 'EETableAsset',
                    defaultEnabled: false,
                    sourceConfig: {
                        asset,
                        label: label.value || defaultLabel(asset, metadata),
                        description: asset
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
    withActivatable({id: 'selectAsset', policy, alwaysAllow: true})
)
