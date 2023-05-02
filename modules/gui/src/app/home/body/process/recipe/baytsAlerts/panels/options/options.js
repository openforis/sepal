import {AssetSelect} from 'widget/assetSelect'
import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {alertsBands} from '../../bands'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './options.module.css'

const fields = {
    advanced: new Form.Field(),
    previousAlertsAsset: new Form.Field(),
    sensitivity: new Form.Field(),
    normalize: new Form.Field(),
    maxDays: new Form.Field(),
    highConfidenceThreshold: new Form.Field(),
    lowConfidenceThreshold: new Form.Field(),
    wetlandMaskAsset: new Form.Field(),

}

class Options extends React.Component {
    constructor(props) {
        super(props)
        this.onPreviousAlertsAssetLoaded = this.onPreviousAlertsAssetLoaded.bind(this)
    }

    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.baytsAlerts.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons>
                    <Button
                        label={advanced.value ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setAdvanced(!advanced.value)}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {advanced}} = this.props
        return advanced.value ? this.renderAdvanced() : this.renderSimple()
    }

    renderSimple() {
        return (
            <React.Fragment>
                {this.renderInitialAsset()}
            </React.Fragment>
        )
    }

    renderAdvanced() {
        return (
            <React.Fragment>
                Advanced
            </React.Fragment>
        )
    }

    renderInitialAsset() {
        const {inputs: {previousAlertsAsset}} = this.props
        return (
            <AssetSelect
                input={previousAlertsAsset}
                label={msg('process.baytsAlerts.panel.options.form.previousAlertsAsset.label')}
                placeholder={msg('process.baytsAlerts.panel.options.form.previousAlertsAsset.placeholder')}
                tooltip={msg('process.baytsAlerts.panel.options.form.previousAlertsAsset.tooltip')}
                autoFocus
                expectedType={['Image', 'ImageCollection']}
                onLoaded={this.onPreviousAlertsAssetLoaded}
            />
        )
    }

    onPreviousAlertsAssetLoaded({metadata}) {
        const {inputs: {previousAlertsAsset}} = this.props
        const bands = metadata.bands.map(({id}) => id)
        const requiredBands = Object.keys(alertsBands())
        const missingBands = requiredBands
            .filter(requiredBand => !bands.includes(requiredBand))
        if (missingBands.length) {
            previousAlertsAsset.setInvalid(msg(
                'process.baytsAlerts.panel.options.form.previousAlertsAsset.missingBands',
                {missingBands: missingBands.join(', ')}
            ))
            
        }
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }
}
const modelToValues = model => {
    return {
        ...model,
        previousAlertsAsset: model.previousAlertsAsset?.id
    }
}

const valuesToModel = values => {
    return {
        ...values,
        previousAlertsAsset: values.previousAlertsAsset
            ? {
                type: 'ASSET',
                id: values.previousAlertsAsset
            }
            : undefined
    }
}

Options.propTypes = {}

export default compose(
    Options,
    recipeFormPanel({id: 'baytsAlertsOptions', fields, modelToValues, valuesToModel})
)
