import PropTypes from 'prop-types'
import React, {Component} from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

import {bandOptionsOf, showLoadError} from '../../../changeImageSelection'
import styles from './inputImage.module.css'

// The image's source, its band, and the band holding its error. A read of the source the image was saved with changes
// nothing saved - its bands, band list and ranges stay as they are, a band the source no longer provides included,
// offered beside the bands it does and refused beside its field (changeImageRequirements.js). Only a source the user
// selects is taken up: the bands it provides become the image's, its band kept, or chosen where none is.
export class ImageForm extends Component {
    // What the latest read of the selected source answered, never saved: null while none has.
    state = {errorBandCleared: true, available: null}

    render() {
        const {input, inputComponent, labelButtons, inputs: {band, errorBand}} = this.props
        const available = this.state.available || []
        return (
            <Layout>
                <div ref={this.element} className={styles.inputComponent}>
                    {React.createElement(inputComponent, {
                        input,
                        labelButtons,
                        onLoading: () => this.setState({available: null}),
                        onLoaded: ({id, bands, metadata, visualizations}) => this.onLoaded(id, bands, metadata, visualizations),
                        onError: error => showLoadError(input, error)
                    })}
                </div>
                <Form.Combo
                    label={msg('process.indexChange.panel.inputImage.changeBand.label')}
                    input={band}
                    disabled={!available.length}
                    options={bandOptionsOf(available, band.value)}
                    onChange={({value}) => {
                        this.setDefaultErrorBand(value, this.state.available || this.props.inputs.bands.value)
                        this.setState({errorBandCleared: false})
                    }}
                />
                <Form.Combo
                    label={msg('process.indexChange.panel.inputImage.errorBand.label')}
                    input={errorBand}
                    disabled={!available.length}
                    options={bandOptionsOf(available, errorBand.value)}
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

    setDefaultErrorBand(band, bandNames = this.props.inputs.bands.value) {
        const {inputs: {errorBand}} = this.props
        const defaultErrorBand = `${band}_rmse`
        bandNames?.includes(defaultErrorBand) && errorBand.set(defaultErrorBand)
    }

    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {input, fromBand, inputs: {band, errorBand, bands, metadata, visualizations}} = this.props
        if (!id) {
            return
        }
        this.setState({available: loadedBands})
        if (!input.isDirty()) {
            metadata.setInitialValue(loadedMetadata)
            visualizations.setInitialValue(loadedVisualizations)
            return
        }
        bands.set(loadedBands)
        const selectedBand = band.value || (loadedBands.includes(fromBand) ? fromBand : loadedBands[0])
        if (!band.value) {
            band.set(selectedBand)
            this.setDefaultErrorBand(selectedBand, loadedBands)
        }
        metadata.set(loadedMetadata)
        visualizations.set(loadedVisualizations)
        this.updateMinMax(selectedBand, errorBand.value, loadedVisualizations)
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
    inputs: PropTypes.any,
    labelButtons: PropTypes.array
}
