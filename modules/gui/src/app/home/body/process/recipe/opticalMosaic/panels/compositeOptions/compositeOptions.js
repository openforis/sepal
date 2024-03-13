import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {Widget} from '~/widget/widget'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './compositeOptions.module.css'

const fields = {
    corrections: new Form.Field(),
    shadowPercentile: new Form.Field(),
    hazePercentile: new Form.Field(),
    ndviPercentile: new Form.Field(),
    dayOfYearPercentile: new Form.Field(),
    cloudDetection: new Form.Field().notEmpty(),
    cloudMasking: new Form.Field(),
    cloudBuffer: new Form.Field(),
    snowMasking: new Form.Field(),
    compose: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    sources: selectFrom(recipe, 'model.sources')
})

class _CompositeOptions extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('process.mosaic.panel.composite.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        return (
            <Layout type='vertical'>
                {this.renderCorrectionOptions()}
                {this.renderFilterOptions()}
                {this.renderCloudMaskingOptions()}
                {this.renderCloudBufferOptions()}
                <Layout type='horizontal'>
                    {this.renderSnowMaskingOptions()}
                    {this.renderComposeOptions()}
                </Layout>
            </Layout>
        )
    }

    renderCorrectionOptions() {
        const {inputs: {corrections}, sources} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.corrections.label')}
                input={corrections}
                multiple={true}
                options={[{
                    value: 'SR',
                    label: msg('process.mosaic.panel.composite.form.corrections.surfaceReflectance.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.corrections.surfaceReflectance.tooltip')
                }, {
                    value: 'BRDF',
                    label: msg('process.mosaic.panel.composite.form.corrections.brdf.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.corrections.brdf.tooltip'),
                }, {
                    value: 'CALIBRATE',
                    label: msg('process.mosaic.panel.composite.form.corrections.calibrate.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.corrections.calibrate.tooltip'),
                    neverSelected: _.flatten(Object.values(sources)).length < 2
                        || corrections.value.includes('SR')
                }]}
            />
        )
    }

    renderFilterOptions() {
        const {
            inputs: {corrections, shadowPercentile, hazePercentile, ndviPercentile, dayOfYearPercentile}
        } = this.props
        return (
            <Widget
                label={msg('process.mosaic.panel.composite.form.filters.label')}
                spacing='compact'
                tooltip={msg('process.mosaic.panel.composite.form.filters.tooltip')}
                tooltipPlacement='top'>
                <PercentileField
                    input={shadowPercentile}/>
                <PercentileField
                    input={hazePercentile}
                    disabled={corrections.value.includes('SR')}/>
                <PercentileField
                    input={ndviPercentile}/>
                <PercentileField
                    input={dayOfYearPercentile}/>
            </Widget>
        )
    }

    renderCloudMaskingOptions() {
        const {sources, inputs: {corrections, cloudDetection, cloudMasking}} = this.props
        const pino26Disabled = corrections.value.includes('SR') || !_.isEqual(Object.keys(sources), ['SENTINEL_2'])
        return (
            <React.Fragment>
                <Form.Buttons
                    label={msg('process.mosaic.panel.composite.form.cloudDetection.label')}
                    input={cloudDetection}
                    multiple
                    options={[{
                        value: 'QA',
                        label: msg('process.mosaic.panel.composite.form.cloudDetection.qa.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.cloudDetection.qa.tooltip'),
                    }, {
                        value: 'CLOUD_SCORE',
                        label: msg('process.mosaic.panel.composite.form.cloudDetection.cloudScore.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.cloudDetection.cloudScore.tooltip'),
                    }, {
                        value: 'PINO_26',
                        label: msg('process.mosaic.panel.composite.form.cloudDetection.pino26.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.cloudDetection.pino26.tooltip'),
                        neverSelected: pino26Disabled
                    }]}
                    type='horizontal'
                />
                <Form.Buttons
                    label={msg('process.mosaic.panel.composite.form.cloudMasking.label')}
                    input={cloudMasking}
                    options={[{
                        value: 'OFF',
                        label: msg('process.mosaic.panel.composite.form.cloudMasking.none.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.cloudMasking.none.tooltip')
                    }, {
                        value: 'MODERATE',
                        label: msg('process.mosaic.panel.composite.form.cloudMasking.moderate.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.cloudMasking.moderate.tooltip')
                    }, {
                        value: 'AGGRESSIVE',
                        label: msg('process.mosaic.panel.composite.form.cloudMasking.aggressive.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.cloudMasking.aggressive.tooltip')
                    }]}
                    type='horizontal'
                />
            </React.Fragment>
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

    renderSnowMaskingOptions() {
        const {inputs: {snowMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.snowMasking.label')}
                input={snowMasking}
                options={[{
                    value: 'OFF',
                    label: msg('process.mosaic.panel.composite.form.snowMasking.off.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.snowMasking.off.tooltip')
                }, {
                    value: 'ON',
                    label: msg('process.mosaic.panel.composite.form.snowMasking.on.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.snowMasking.on.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    renderComposeOptions() {
        const {inputs: {compose}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.composingMethod.label')}
                input={compose}
                options={[{
                    value: 'MEDOID',
                    label: msg('process.mosaic.panel.composite.form.composingMethod.medoid.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.composingMethod.medoid.tooltip')
                }, {
                    value: 'MEDIAN',
                    label: msg('process.mosaic.panel.composite.form.composingMethod.median.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.composingMethod.median.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    componentDidMount() {
        const {inputs: {cloudBuffer}} = this.props
        if (cloudBuffer.value === undefined)
            cloudBuffer.set(0)
    }
}

const PercentileField = ({input, disabled = false}) => {
    return (
        <Form.Slider
            input={input}
            minValue={0}
            maxValue={100}
            ticks={[0, 10, 25, 50, 75, 90, 100]}
            snap
            range='high'
            info={percentile => {
                const type = percentile === 0 ? 'off' : percentile === 100 ? 'max' : 'percentile'
                return msg(['process.mosaic.panel.composite.form.filters', input.name, type], {percentile})
            }}
            disabled={disabled}/>
    )
}

PercentileField.propTypes = {
    disabled: PropTypes.any,
    input: PropTypes.object
}

const valuesToModel = values => ({
    corrections: values.corrections,
    filters: [
        {type: 'SHADOW', percentile: values.shadowPercentile},
        {type: 'HAZE', percentile: values.hazePercentile},
        {type: 'NDVI', percentile: values.ndviPercentile},
        {type: 'DAY_OF_YEAR', percentile: values.dayOfYearPercentile},
    ].filter(({percentile}) => percentile),
    cloudDetection: values.cloudDetection,
    cloudMasking: values.cloudMasking,
    cloudBuffer: values.cloudBuffer,
    snowMasking: values.snowMasking,
    compose: values.compose,
})

const modelToValues = model => {
    const getPercentile = type => {
        const filter = model.filters.find(filter => filter.type === type)
        return filter ? filter.percentile : 0
    }
    return ({
        corrections: model.corrections,
        shadowPercentile: getPercentile('SHADOW'),
        hazePercentile: getPercentile('HAZE'),
        ndviPercentile: getPercentile('NDVI'),
        dayOfYearPercentile: getPercentile('DAY_OF_YEAR'),
        cloudDetection: model.cloudDetection,
        cloudMasking: model.cloudMasking,
        cloudBuffer: model.cloudBuffer,
        snowMasking: model.snowMasking,
        compose: model.compose,
    })
}

const additionalPolicy = () => ({sceneSelection: 'allow'})

const panelOptions = {
    id: 'compositeOptions',
    fields,
    mapRecipeToProps,
    modelToValues,
    valuesToModel,
    additionalPolicy
}

export const CompositeOptions = compose(
    _CompositeOptions,
    recipeFormPanel(panelOptions)
)

CompositeOptions.propTypes = {
    disabled: PropTypes.any,
    recipeId: PropTypes.string,
    sources: PropTypes.any
}
