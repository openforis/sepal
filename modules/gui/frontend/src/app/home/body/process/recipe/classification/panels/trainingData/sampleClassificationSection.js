import * as PropTypes from 'prop-types'
import {Form} from 'widget/form/form'
import {FormCombo} from 'widget/form/combo'
import {Layout} from 'widget/layout'
import {Subject, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {msg} from 'translate'
import React, {Component} from 'react'
import api from 'api'

class SampleClassificationSection extends Component {
    eeTableChanged$ = new Subject()

    render() {
        return (
            <Layout>
                {this.renderSamplesPerClass()}
                {this.renderSampleScale()}
                {this.renderAssetToSample()}
                {this.renderValueColumnInput()}
            </Layout>
        )
    }

    renderSamplesPerClass() {
        const {inputs: {samplesPerClass}} = this.props
        return <Form.Slider
            label={msg('process.classification.panel.trainingData.form.sampleClassification.samplesPerClass.label')}
            info={(countLabel, count) => msg('process.classification.panel.trainingData.form.sampleClassification.samplesPerClass.info', {count})}
            input={samplesPerClass}
            minValue={100}
            maxValue={5000}
            ticks={[
                {value: 100, label: '100'},
                {value: 500, label: '500'},
                {value: 1000, label: '1K'},
                {value: 1500, label: '1.5K'},
                {value: 2000, label: '2K'},
                {value: 2500, label: '2.5K'},
                {value: 3000, label: '3K'},
                {value: 3500, label: '3.4K'},
                {value: 4000, label: '4K'},
                {value: 4500, label: '4.5K'},
                {value: 5000, label: '5K'}
            ]}
            snap
            range='none'
            onChange={count => this.loadInputData({
                asset: this.props.inputs.assetToSample.value,
                count,
                scale: this.props.inputs.sampleScale.value,
                classBand: this.props.inputs.valueColumn.value
            })}
        />
    }

    renderSampleScale() {
        const {inputs: {sampleScale}} = this.props
        return <Form.Slider
            label={msg('process.classification.panel.trainingData.form.sampleClassification.sampleScale.label')}
            info={scale => msg('process.classification.panel.trainingData.form.sampleClassification.sampleScale.info', {scale})}
            input={sampleScale}
            minValue={10}
            maxValue={100}
            scale={'log'}
            ticks={[10, 15, 20, 30, 60, 100]}
            snap
            range='none'
            onChange={scale => this.loadInputData({
                asset: this.props.inputs.assetToSample.value,
                count: this.props.inputs.samplesPerClass.value,
                scale,
                classBand: this.props.inputs.valueColumn.value
            })}
        />
    }

    renderAssetToSample() {
        const {inputs: {assetToSample}} = this.props
        return <Form.Input
            label={msg('process.classification.panel.trainingData.form.sampleClassification.assetToSample.label')}
            autoFocus
            input={assetToSample}
            placeholder={msg('process.classification.panel.trainingData.form.sampleClassification.assetToSample.placeholder')}
            spellCheck={false}
            errorMessage
            onChangeDebounced={asset =>
                this.loadInputData({
                    asset,
                    count: this.props.inputs.samplesPerClass.value,
                    scale: this.props.inputs.sampleScale.value,
                    classBand: this.props.inputs.valueColumn.value
                })}
            busyMessage={this.props.stream('SAMPLE_IMAGE').active && msg('widget.loading')}
        />
    }

    renderValueColumnInput() {
        const {inputs: {columns, valueColumn}} = this.props
        const columnNames = columns.value || []
        const columnOptions = columnNames
            .filter(column => column !== '.geo')
            .map(column => ({value: column, label: column}))
        return (
            <FormCombo
                input={valueColumn}
                disabled={!columnNames.length}
                options={columnOptions}
                label={msg('process.classification.panel.trainingData.form.sampleClassification.valueColumn.label')}
                placeholder={msg('process.classification.panel.trainingData.form.sampleClassification.valueColumn.placeholder')}
                tooltip={msg('process.classification.panel.trainingData.form.sampleClassification.valueColumn.tooltip')}
                onChange={({value: classBand}) =>
                    this.loadInputData({
                        asset: this.props.inputs.assetToSample.value,
                        count: this.props.inputs.samplesPerClass.value,
                        scale: this.props.inputs.sampleScale.value,
                        classBand
                    })}
            />
        )
    }

    componentDidMount() {
        const {inputs: {assetToSample, samplesPerClass, sampleScale, valueColumn}} = this.props
        const count = samplesPerClass.value || '1000'
        const scale = sampleScale.value || '30'
        samplesPerClass.set(count)
        sampleScale.set(scale)
        const asset = assetToSample.value
        this.loadInputData({asset, count, scale, classBand: valueColumn.value})
    }

    loadInputData({asset, count, scale, classBand}) {
        if (!asset || !count || !scale)
            return
        const {stream, inputs: {name, inputData, columns, valueColumn}} = this.props
        this.eeTableChanged$.next()
        name.set(null)
        inputData.set(null)
        columns.set(null)
        stream('SAMPLE_IMAGE',
            api.gee.sampleImage$({asset, count, scale, classBand}).pipe(
                takeUntil(this.eeTableChanged$)
            ),
            featureCollection => {
                name.set(asset.substring(asset.lastIndexOf('/') + 1))
                inputData.set(this.toInputData(featureCollection))
                columns.set(['.geo', ...Object.keys(featureCollection.columns)])
                if (!classBand) {
                    valueColumn.set(Object.keys(featureCollection.columns)[0])
                }
            },
            error => {
                const response = error.response || {}
                const {defaultMessage, messageKey, messageArgs} = response
                this.props.inputs.assetToSample.setInvalid(
                    messageKey
                        ? msg(messageKey, messageArgs, defaultMessage)
                        : msg('asset.failedToLoad')
                )
            }
        )
    }

    toInputData(featureCollection) {
        return featureCollection.features.map(feature => {
            return {'.geo': feature.geometry, ...feature.properties}
        })
    }
}

SampleClassificationSection.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}

export default compose(
    SampleClassificationSection
)
