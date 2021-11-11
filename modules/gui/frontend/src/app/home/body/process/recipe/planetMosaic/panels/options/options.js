import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './options.module.css'

const fields = {
    cloudThreshold: new Form.Field(),
    shadowThreshold: new Form.Field(),
    cloudBuffer: new Form.Field()
}

class Options extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('process.planetMosaic.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        return (
            <Layout>
                {this.renderCloudThreshold()}
                {this.renderShadowThreshold()}
                {this.renderCloudBufferOptions()}
            </Layout>
        )
    }

    renderShadowThreshold() {
        const {inputs: {shadowThreshold}} = this.props
        return (
            <Form.Slider
                label={msg('process.planetMosaic.panel.options.shadowThreshold.label')}
                tooltip={msg('process.planetMosaic.panel.options.shadowThreshold.tooltip')}
                input={shadowThreshold}
                minValue={0}
                maxValue={100}
                ticks={[0, 10, 25, 50, 75, 90, 100]}
                info={value => msg('process.planetMosaic.panel.options.shadowThreshold.value', {value})}
            />
        )
    }

    renderCloudThreshold() {
        const {inputs: {cloudThreshold}} = this.props
        return (
            <Form.Slider
                label={msg('process.planetMosaic.panel.options.cloudThreshold.label')}
                tooltip={msg('process.planetMosaic.panel.options.cloudThreshold.tooltip')}
                input={cloudThreshold}
                minValue={0}
                maxValue={100}
                ticks={[0, 10, 25, 50, 75, 90, 100]}
                info={value => msg('process.planetMosaic.panel.options.cloudThreshold.value', {value})}
            />
        )
    }

    renderCloudBufferOptions() {
        const {inputs: {cloudBuffer}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.cloudBuffer.label')}
                input={cloudBuffer}
                options={[{
                    value: 0,
                    label: msg('process.mosaic.panel.composite.form.cloudBuffer.none.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.cloudBuffer.none.tooltip')
                }, {
                    value: 120,
                    label: msg('process.mosaic.panel.composite.form.cloudBuffer.moderate.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.cloudBuffer.moderate.tooltip')
                }, {
                    value: 600,
                    label: msg('process.mosaic.panel.composite.form.cloudBuffer.aggressive.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.cloudBuffer.aggressive.tooltip')
                }]}
                type='horizontal-wrap'
            />
        )
    }
}

const valuesToModel = values => ({
    cloudThreshold: 1 - values.cloudThreshold / 100,
    shadowThreshold: 1 - values.shadowThreshold / 100,
    cloudBuffer: values.cloudBuffer || 0
})

const modelToValues = model => ({
    cloudThreshold: 100 - model.cloudThreshold * 100,
    shadowThreshold: 100 - model.shadowThreshold * 100,
    cloudBuffer: model.cloudBuffer || 0
})

export default compose(
    Options,
    recipeFormPanel({id: 'options', fields, modelToValues, valuesToModel})
)
