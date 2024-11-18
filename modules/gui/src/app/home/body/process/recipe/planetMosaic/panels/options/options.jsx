import _ from 'lodash'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './options.module.css'

const fields = {
    cloudThreshold: new Form.Field(),
    shadowThreshold: new Form.Field(),
    cloudBuffer: new Form.Field(),
    histogramMatching: new Form.Field()
}

class _Options extends React.Component {
    render() {
        const {title} = this.props
        
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='layer-group'
                    title={title || msg('process.planetMosaic.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {forCollection} = this.props
        return (
            <Layout>
                {this.renderHistogramMatching()}
                {this.renderCloudThreshold()}
                {!forCollection ? this.renderShadowThreshold() : null}
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
                type='horizontal'
            />
        )
    }

    renderHistogramMatching() {
        const {source, inputs: {histogramMatching}} = this.props
        if (source !== 'DAILY') {
            return null
        }
        const options = [
            {value: 'ENABLED', label: msg('process.planetMosaic.panel.options.form.histogramMatching.options.ENABLED')},
            {value: 'DISABLED', label: msg('process.planetMosaic.panel.options.form.histogramMatching.options.DISABLED')},
        ]
        return (
            <Form.Buttons
                label={msg('process.planetMosaic.panel.options.form.histogramMatching.label')}
                tooltip={msg('process.planetMosaic.panel.options.form.histogramMatching.tooltip')}
                input={histogramMatching}
                options={options}
            />
        )
    }

    componentDidMount() {
        const {inputs: {histogramMatching, cloudThreshold, shadowThreshold, cloudBuffer}} = this.props
        if (!histogramMatching.value) {
            histogramMatching.set('DISABLED')
        }
        if (!cloudThreshold.value && cloudThreshold.value !== 0) {
            cloudThreshold.set(85)
        }
        if (!shadowThreshold.value && shadowThreshold.value !== 0) {
            shadowThreshold.set(60)
        }
        if (!_.isNumber(cloudBuffer.value)) {
            cloudBuffer.set(0)
        }
    }
}

const valuesToModel = values => ({
    histogramMatching: values.histogramMatching || 'DISABLED',
    cloudThreshold: 1 - values.cloudThreshold / 100,
    shadowThreshold: 1 - values.shadowThreshold / 100,
    cloudBuffer: values.cloudBuffer || 0
})

const modelToValues = model => ({
    histogramMatching: model.histogramMatching || 'DISABLED',
    cloudThreshold: 100 - model.cloudThreshold * 100,
    shadowThreshold: 100 - model.shadowThreshold * 100,
    cloudBuffer: model.cloudBuffer || 0
})

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'options', fields, modelToValues, valuesToModel})
)
