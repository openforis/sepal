import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './assetDetails.module.css'

const fields = {
    assetId: new Form.Field()
        .notBlank(),
    type: new Form.Field()
        .notEmpty(),
    bands: new Form.Field()
        .notEmpty(),
    visualizations: new Form.Field(),
    metadata: new Form.Field(),
}

class _AssetDetails extends React.Component {
    constructor(props) {
        super(props)
        this.onLoading = this.onLoading.bind(this)
        this.onLoaded = this.onLoaded.bind(this)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='calendar-alt'
                    title={msg('process.asset.panel.assetDetails.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderAssetSelector()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderAssetSelector() {
        const {inputs: {assetId}} = this.props
        return (
            <Form.AssetCombo
                input={assetId}
                label={msg('process.asset.panel.assetDetails.form.assetId.label')}
                placeholder={msg('process.asset.panel.assetDetails.form.assetId.placeholder')}
                allowedTypes={['Image', 'ImageCollection']}
                autoFocus
                onLoading={this.onLoading}
                onLoaded={this.onLoaded}
            />
        )
    }

    onLoading() {
        const {inputs: {type, bands, visualizations, metadata}} = this.props
        type.set(null)
        bands.set([])
        visualizations.set([])
        metadata.set({})
    }

    onLoaded(foo) {
        const {metadata, visualizations} = foo
        const {inputs} = this.props
        inputs.type.set(metadata.type)
        inputs.bands.set(metadata.bands)
        inputs.visualizations.set(visualizations)
        inputs.metadata.set(metadata)
    }
}

export const AssetDetails = compose(
    _AssetDetails,
    recipeFormPanel({id: 'assetDetails', fields})
)

AssetDetails.propTypes = {}
