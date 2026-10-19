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
// selects is taken up: the bands it provides become the image's, its band and error band kept where it provides them,
// its band chosen where none was. One it does not provide is cleared, quietly, for the user to choose again.
export class ImageForm extends Component {
    // What the latest read of the selected source answered, never saved: null while none has.
    state = {errorBandCleared: true, available: null}
    // A band chosen of another source, cleared as one this source lacks: the user chooses again, so no default fills it
    // until a band is chosen or the source kind starts over.
    bandCleared = false

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
                        this.bandCleared = false
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

    componentDidUpdate({input: prevInput}) {
        if (prevInput?.name !== this.props.input?.name) {
            this.bandCleared = false
        }
        this.update()
    }

    update() {
        const {fromBand, inputs: {band, bands, errorBand}} = this.props
        const {errorBandCleared} = this.state

        if (!band.value && fromBand && bands.value && !this.bandCleared) {
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
        const provided = name => loadedBands.includes(name)
        const keptErrorBand = provided(errorBand.value) ? errorBand.value : undefined
        if (errorBand.value && !keptErrorBand) {
            // As if the user cleared it: no default error band fills it until a band is chosen.
            this.setState({errorBandCleared: true})
            errorBand.set(undefined, {validate: false})
        }
        const selectedBand = band.value
            ? (provided(band.value) ? band.value : undefined)
            : this.bandCleared ? undefined : (provided(fromBand) ? fromBand : loadedBands[0])
        if (!band.value && selectedBand) {
            band.set(selectedBand)
            this.setDefaultErrorBand(selectedBand, loadedBands)
        } else if (band.value && !selectedBand) {
            this.bandCleared = true
            band.set(undefined, {validate: false})
        }
        metadata.set(loadedMetadata)
        visualizations.set(loadedVisualizations)
        this.updateMinMax(selectedBand, keptErrorBand, loadedVisualizations)
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
