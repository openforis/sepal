import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {msg} from '~/translate'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import styles from './inputImage.module.css'

export class ImageForm extends Component {
    state = {errorBandCleared: true}

    render() {
        const {input, inputComponent, inputs: {band, errorBand, bands}} = this.props
        const bandOptions = (bands.value || [])
            .map(bandName => ({
                value: bandName,
                label: bandName
            }))
        return (
            <Layout>
                <div ref={this.element} className={styles.inputComponent}>
                    {React.createElement(inputComponent, {
                        input,
                        onLoading: () => {
                            bands.set(undefined)
                        },
                        onLoaded: ({id, bands, metadata, visualizations}) => this.onLoaded(id, bands, metadata, visualizations)
                    })}
                </div>
                <Form.Combo
                    label={msg('process.indexChange.panel.inputImage.changeBand.label')}
                    input={band}
                    disabled={!bandOptions.length}
                    options={bandOptions}
                    onChange={({value}) => {
                        this.setDefaultErrorBand(value)
                        this.setState({errorBandCleared: false})
                    }}
                />
                <Form.Combo
                    label={msg('process.indexChange.panel.inputImage.errorBand.label')}
                    input={errorBand}
                    disabled={!bandOptions.length}
                    options={bandOptions}
                    allowClear
                    onChange={selectedOption => {
                        this.setState({errorBandCleared: !selectedOption})
                    }}
                />
            </Layout>
        )
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {fromBand, inputs: {band, bands, errorBand}} = this.props
        const {errorBandCleared} = this.state

        if (!band.value && fromBand && bands.value) {
            bands.value?.includes(fromBand) && band.set(fromBand)
        }

        if (!errorBandCleared && !errorBand.value && band.value && bands.value) {
            this.setDefaultErrorBand(band.value)
        }
    }

    setDefaultErrorBand(band) {
        const {inputs: {bands, errorBand}} = this.props
        const defaultErrorBand = `${band}_rmse`
        bands.value?.includes(defaultErrorBand) && errorBand.set(defaultErrorBand)
    }

    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {fromBand, form, inputs: {band, errorBand, bands, metadata, visualizations}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        bands.set(loadedBands)
        const bandNames = loadedBands
        const selectedBand = band.value
        if (!selectedBand || !bandNames.includes(selectedBand)) {
            const defaultBand = fromBand || bandNames[0]
            band.set(defaultBand)
            this.setDefaultErrorBand(defaultBand)
        }
        metadata.set(loadedMetadata)
        visualizations.set(loadedVisualizations)
        this.updateMinMax(band.value, errorBand.value, loadedVisualizations)
    }

    updateMinMax(band, errorBand, visualizations) {
        const {inputs: {bandMin, bandMax, errorBandMax}} = this.props
        const toMinMax = band => [
            ...visualizations
                .filter(({bands}) => bands.includes(band))
                .map(({bands, min, max}) => {
                    const i = bands.indexOf(band)
                    return {min: min[i], max: max[i]}
                }),
            {min: -10000, max: 10000}
        ][0]
        const minMax = toMinMax(band)
        bandMin.set(minMax.min)
        bandMax.set(minMax.max)
        if (errorBand) {
            errorBandMax.set(toMinMax(errorBand).max)
        }
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any
}
