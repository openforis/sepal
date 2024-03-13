import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import React from 'react'
import styles from './options.module.css'

const fields = {
    cloudThreshold: new Form.Field(),
    shadowThreshold: new Form.Field(),
    cloudBuffer: new Form.Field(),
    histogramMatching: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    source: selectFrom(recipe, 'model.sources.source')
})

class _Options extends React.Component {
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
                {this.renderHistogramMatching()}
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
                disabled={this.noProcessing()}
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
                disabled={this.noProcessing()}
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
                disabled={this.noProcessing()}
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
        const {inputs: {histogramMatching}} = this.props
        if (!histogramMatching.value) {
            histogramMatching.set('DISABLED')
        }
    }

    noProcessing() {
        const {source, inputs: {histogramMatching}} = this.props
        return source === 'DAILY' && histogramMatching.value !== 'ENABLED'
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
    recipeFormPanel({id: 'options', fields, mapRecipeToProps, modelToValues, valuesToModel})
)
