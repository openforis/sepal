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

class _SampleImageSection extends React.Component {
    cancel$ = new Subject()
    state = {bands: []}

    render() {
        const {inputs: {typeToSample}} = this.props
        return (
            <Layout>
                {this.renderSampleCount()}
                {this.renderSampleScale()}
                {this.renderTypeToSample()}
                {typeToSample.value === 'ASSET' && this.renderAssetToSample()}
                {typeToSample.value === 'RECIPE' && this.renderRecipeToSample()}
                {this.renderValueBandInput()}
            </Layout>
        )
    }

    renderSampleCount() {
        const {inputs: {sampleCount}} = this.props
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
                label={msg('process.regression.panel.trainingData.form.sampleImage.sampleCount.label')}
                placeholder={msg('process.regression.panel.trainingData.form.sampleImage.sampleCount.placeholder')}
                tooltip={msg('process.regression.panel.trainingData.form.sampleImage.sampleCount.tooltip')}
                input={sampleCount}
                options={options}
                suffix={msg('process.regression.panel.trainingData.form.sampleImage.sampleCount.suffix')}
                onChange={count => this.sampleData({
                    asset: this.props.inputs.assetToSample.value,
                    count,
                    scale: this.props.inputs.sampleScale.value,
                    valueBand: this.props.inputs.valueColumn.value
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
                onChange={scale => this.sampleData({
                    asset: this.props.inputs.assetToSample.value,
                    count: this.props.inputs.sampleCount.value,
                    scale,
                    valueBand: this.props.inputs.valueColumn.value
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
                onLoading={() => {
                    // this.cancel$.next()
                    this.setState({bands: []})
                    this.props.inputs.referenceData.set(null)
                }}
                onLoaded={({metadata}) => {
                    const bands = metadata.bands.map(({id}) => id) || []
                    if (bands.includes(this.props.inputs.valueColumn.value)) {
                        this.setState({bands}, () => this.sampleData({
                            asset: this.props.inputs.assetToSample.value,
                            count: this.props.inputs.sampleCount.value,
                            scale: this.props.inputs.sampleScale.value,
                            valueBand: this.props.inputs.valueColumn.value
                        }))
                    } else {
                        this.setState({bands})
                        this.props.inputs.valueColumn.set(null)
                    }
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
                onLoading={() => {
                    this.cancel$.next()
                    this.setState({bands: []})
                    this.props.inputs.referenceData.set(null)
                }}
                onLoaded={({bandNames: bands, recipe}) => {
                    if (bands.includes(this.props.inputs.valueColumn.value)) {
                        this.setState({bands, recipeToSample: recipe}, () => this.sampleData({
                            asset: this.props.inputs.assetToSample.value,
                            count: this.props.inputs.sampleCount.value,
                            scale: this.props.inputs.sampleScale.value,
                            valueBand: this.props.inputs.valueColumn.value
                        }))
                    } else {
                        this.setState({bands, recipeToSample: recipe})
                        this.props.inputs.valueColumn.set(null)
                    }
                }}
            />
        )
    }

    renderValueBandInput() {
        const {inputs: {valueColumn}} = this.props
        const {bands = []} = this.state
        const options = bands
            .map(band => ({value: band, label: band}))
        return (
            <FormCombo
                input={valueColumn}
                disabled={!bands.length}
                options={options}
                label={msg('process.regression.panel.trainingData.form.sampleImage.valueBand.label')}
                placeholder={msg('process.regression.panel.trainingData.form.sampleImage.valueBand.placeholder')}
                tooltip={msg('process.regression.panel.trainingData.form.sampleImage.valueBand.tooltip')}
                busyMessage={this.props.stream('SAMPLE_IMAGE').active && msg('widget.loading')}
                onChange={({value: valueBand}) =>
                    this.sampleData({
                        asset: this.props.inputs.assetToSample.value,
                        count: this.props.inputs.sampleCount.value,
                        scale: this.props.inputs.sampleScale.value,
                        valueBand
                    })
                }
            />
        )
    }

    componentDidMount() {
        const {inputs: {typeToSample, sampleCount, sampleScale}} = this.props
        const count = sampleCount.value || '1000'
        const scale = sampleScale.value || '30'
        sampleCount.set(count)
        sampleScale.set(scale)
        if (!typeToSample.value) {
            typeToSample.set('ASSET')
        }
        // this.sampleData({
        //     asset: this.props.inputs.assetToSample.value,
        //     count: this.props.inputs.sampleCount.value,
        //     scale: this.props.inputs.sampleScale.value,
        //     valueBand
        // })}

    }

    sampleData({asset, count, scale, valueBand}) {
        const {inputs: {typeToSample}} = this.props
        const {recipeToSample} = this.state
        if (
            (typeToSample.value === 'ASSET' && !asset)
            || (typeToSample.value === 'RECIPE' && !recipeToSample)
            || (!valueBand)
            || !count
            || !scale
        ) {
            return
        }
        const {stream, inputs: {name, referenceData, valueColumn}, recipe} = this.props
        this.cancel$.next()
        name.set(null)
        referenceData.set(null)
        this.props.inputs.valueColumn.setInvalid() // Reset any eventual error
        stream('SAMPLE_IMAGE',
            api.gee.sampleImage$({
                recipeToSample: typeToSample.value === 'ASSET'
                    ? {type: 'ASSET', id: asset}
                    : recipeToSample,
                count,
                scale,
                valueBand,
                recipe,
                bands: [valueBand]
            }).pipe(
                takeUntil(this.cancel$)
            ),
            featureCollection => {
                name.set(
                    typeToSample.value === 'ASSET'
                        ? asset.substring(asset.lastIndexOf('/') + 1)
                        : recipeToSample.title || recipeToSample.placeholder
                )
                const referenceDataValue = this.toReferenceData({featureCollection, valueBand})
                referenceData.set(referenceDataValue)
                if (!valueBand) {
                    valueColumn.set(Object.keys(featureCollection.columns)[0])
                }
            },
            error => {
                const response = error.response || {}
                const {defaultMessage, messageKey, messageArgs} = response
                this.props.inputs.valueColumn.setInvalid(
                    messageKey
                        ? msg(messageKey, messageArgs, defaultMessage)
                        : msg('asset.failedToLoad')
                )
            }
        )
    }

    toReferenceData({featureCollection, valueBand}) {
        return featureCollection.features.map(feature => {
            const [x, y] = feature.geometry.coordinates
            return {x, y, value: feature.properties[valueBand]}
        })
    }
}

export const SampleImageSection = compose(
    _SampleImageSection,
    withRecipe(mapRecipeToProps),
)

SampleImageSection.propTypes = {
    children: PropTypes.any,
    inputs: PropTypes.any
}
