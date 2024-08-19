import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'
import {RecipeInput} from 'widget/recipeInput'

import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {FormCombo} from '~/widget/form/combo'
import {Layout} from '~/widget/layout'
import {NumberButtons} from '~/widget/numberButtons'

const mapRecipeToProps = recipe => ({recipe})

class _SampleClassificationSection extends React.Component {
    cancel$ = new Subject()
    state = {bands: []}

    render() {
        const {inputs: {typeToSample}} = this.props
        return (
            <Layout>
                {this.renderSamplesPerClass()}
                {this.renderSampleScale()}
                {this.renderTypeToSample()}
                {typeToSample.value === 'ASSET' && this.renderAssetToSample()}
                {typeToSample.value === 'RECIPE' && this.renderRecipeToSample()}
                {this.renderValueColumnInput()}
            </Layout>
        )
    }

    renderSamplesPerClass() {
        const {inputs: {samplesPerClass}} = this.props
        const options = [
            {value: 20, label: '20'},
            {value: 50, label: '50'},
            {value: 100, label: '100'},
            {value: 250, label: '250'},
            {value: 500, label: '500'},
            {value: 1000, label: '1K'},
            {value: 2000, label: '2K'},
            {value: 3000, label: '3K'},
            {value: 5000, label: '5K'},
        ]
        return (
            <NumberButtons
                label={msg('process.classification.panel.trainingData.form.sampleClassification.samplesPerClass.label')}
                placeholder={msg('process.classification.panel.trainingData.form.sampleClassification.samplesPerClass.placeholder')}
                tooltip={msg('process.classification.panel.trainingData.form.sampleClassification.samplesPerClass.tooltip')}
                input={samplesPerClass}
                options={options}
                suffix={msg('process.classification.panel.trainingData.form.sampleClassification.samplesPerClass.suffix')}
                onChange={count => this.loadInputData({
                    asset: this.props.inputs.assetToSample.value,
                    count,
                    scale: this.props.inputs.sampleScale.value,
                    classBand: this.props.inputs.valueColumn.value
                })}
            />
        )
    }

    renderSampleScale() {
        const {inputs: {sampleScale}} = this.props
        return (
            <NumberButtons
                label={msg('process.classification.panel.trainingData.form.sampleClassification.sampleScale.label')}
                placeholder={msg('process.classification.panel.trainingData.form.sampleClassification.sampleScale.placeholder')}
                tooltip={msg('process.classification.panel.trainingData.form.sampleClassification.sampleScale.tooltip')}
                input={sampleScale}
                options={[3, 5, 10, 15, 20, 30, 60, 100, 200, 500]}
                suffix={msg('process.classification.panel.trainingData.form.sampleClassification.sampleScale.suffix')}
                onChange={scale => this.loadInputData({
                    asset: this.props.inputs.assetToSample.value,
                    count: this.props.inputs.samplesPerClass.value,
                    scale,
                    classBand: this.props.inputs.valueColumn.value
                })}
            />
        )
    }

    renderTypeToSample() {
        const {inputs: {typeToSample}} = this.props
        return (
            <Form.Buttons
                label={msg('process.classification.panel.trainingData.form.sampleClassification.typeToSample.label')}
                input={typeToSample}
                options={[
                    {value: 'ASSET', label: msg('process.classification.panel.trainingData.form.sampleClassification.typeToSample.ASSET')},
                    {value: 'RECIPE', label: msg('process.classification.panel.trainingData.form.sampleClassification.typeToSample.RECIPE')},
                ]}
            />
        )
    }

    renderAssetToSample() {
        const {inputs: {assetToSample}} = this.props
        return (
            <Form.AssetCombo
                label={msg('process.classification.panel.trainingData.form.sampleClassification.assetToSample.label')}
                autoFocus
                input={assetToSample}
                placeholder={msg('process.classification.panel.trainingData.form.sampleClassification.assetToSample.placeholder')}
                allowedTypes={['Image', 'ImageCollection']}
                onLoading={() => this.setState({bands: []})}
                onLoaded={({metadata}) => {
                    const bands = metadata.bands.map(({id}) => id) || []
                    this.setState({bands}, () => this.loadInputData({
                        asset: this.props.inputs.assetToSample.value,
                        count: this.props.inputs.samplesPerClass.value,
                        scale: this.props.inputs.sampleScale.value,
                        classBand: this.props.inputs.valueColumn.value
                    }))
                }}
                busyMessage={this.props.stream('SAMPLE_IMAGE').active && msg('widget.loading')}
            />
        )
    }

    renderRecipeToSample() {
        const {inputs: {recipeIdToSample}} = this.props
        return (
            <RecipeInput
                input={recipeIdToSample}
                filter={type => !type.noImageOutput}
                autoFocus
                onLoading={() => this.setState({bands: []})}
                onLoaded={({bandNames: bands, recipe}) => {
                    this.setState({bands, recipeToSample: recipe}, () =>
                        this.setState({bands}, () => this.loadInputData({
                            asset: this.props.inputs.assetToSample.value,
                            count: this.props.inputs.samplesPerClass.value,
                            scale: this.props.inputs.sampleScale.value,
                            classBand: this.props.inputs.valueColumn.value
                        })))
                }}
            />
        )
    }

    renderValueColumnInput() {
        const {inputs: {valueColumn}} = this.props
        const {bands = []} = this.state
        const options = bands
            .map(band => ({value: band, label: band}))
        return (
            <FormCombo
                input={valueColumn}
                disabled={!bands.length}
                options={options}
                label={msg('process.classification.panel.trainingData.form.sampleClassification.valueColumn.label')}
                placeholder={msg('process.classification.panel.trainingData.form.sampleClassification.valueColumn.placeholder')}
                tooltip={msg('process.classification.panel.trainingData.form.sampleClassification.valueColumn.tooltip')}
                busyMessage={this.props.stream('SAMPLE_IMAGE').active && msg('widget.loading')}
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
        const {inputs: {typeToSample, samplesPerClass, sampleScale}} = this.props
        const count = samplesPerClass.value || '100'
        const scale = sampleScale.value || '30'
        samplesPerClass.set(count)
        sampleScale.set(scale)
        if (!typeToSample.value) {
            typeToSample.set('ASSET')
        }
    }

    loadInputData({asset, count, scale, classBand}) {
        const {inputs: {typeToSample}} = this.props
        const {recipeToSample} = this.state
        if (
            (typeToSample.value === 'ASSET' && !asset)
            || (typeToSample.value === 'RECIPE' && !recipeToSample)
            || !count
            || !scale
        ) {
            return
        }
        const {stream, inputs: {name, inputData, columns, valueColumn}, recipe} = this.props
        this.cancel$.next()
        name.set(null)
        inputData.set(null)
        columns.set(null)
        stream('SAMPLE_IMAGE',
            api.gee.sampleImage$({
                recipeToSample: typeToSample.value === 'ASSET'
                    ? {type: 'ASSET', id: asset}
                    : recipeToSample,
                count,
                scale,
                classBand,
                recipe
            }).pipe(
                takeUntil(this.cancel$)
            ),
            featureCollection => {
                name.set(
                    typeToSample.value === 'ASSET'
                        ? asset.substring(asset.lastIndexOf('/') + 1)
                        : recipeToSample.title || recipeToSample.placeholder
                )
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

export const SampleClassificationSection = compose(
    _SampleClassificationSection,
    withRecipe(mapRecipeToProps),
)

SampleClassificationSection.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}
