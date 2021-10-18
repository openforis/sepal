import * as PropTypes from 'prop-types'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {msg} from 'translate'
import {withScrollable} from 'widget/scrollable'
import React, {Component} from 'react'
import styles from './inputImage.module.css'

class ImageForm extends Component {
    render() {
        const {input, inputComponent, inputs: {band, errorBand, bands}} = this.props
        const bandOptions = (Object.keys(bands.value) || [])
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
                            bands.set({})
                        },
                        onLoaded: ({id, bands, metadata, visualizations}) => this.onLoaded(id, bands, metadata, visualizations)
                    })}
                </div>
                <Form.Combo
                    label={msg('process.indexChange.panel.inputImage.changeBand.label')}
                    input={band}
                    disabled={!bandOptions.length}
                    options={bandOptions}
                />
                <Form.Combo
                    label={msg('process.indexChange.panel.inputImage.errorBand.label')}
                    input={errorBand}
                    disabled={!bandOptions.length}
                    options={bandOptions}
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
        if (!band.value && fromBand && bands.value) {
            bands.value[fromBand] && band.set(fromBand)
        }

        if (!errorBand.value && band.value && bands.value) {
            const defaultErrorBand = `${band.value}_rmse`
            bands.value[defaultErrorBand] && errorBand.set(defaultErrorBand)
        }
    }

    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {fromBand, form, inputs: {band, errorBand, bands, metadata, visualizations}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        bands.set(loadedBands)
        const bandNames = Object.keys(loadedBands)
        const selectedBand = band.value
        if (!selectedBand || !bandNames.includes(selectedBand)) {
            const defaultBand = fromBand || bandNames[0]
            band.set(defaultBand)
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

export default compose(
    ImageForm,
    withScrollable()
)
