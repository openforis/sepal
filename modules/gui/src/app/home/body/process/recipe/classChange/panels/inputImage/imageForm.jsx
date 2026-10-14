import PropTypes from 'prop-types'
import React, {Component} from 'react'

import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {FormCombo} from '~/widget/form/combo'
import {Layout} from '~/widget/layout'
import {Legend} from '~/widget/legend/legend'

import {bandOptionsOf, showLoadError} from '../../../changeImageSelection'
import styles from './inputImage.module.css'

// The image's source, its class band and the legend of its classes. A read of the source the image was saved with
// changes nothing saved - its band, legend and band list stay as they are, a band the source no longer provides
// included, offered beside the bands it does and refused beside its field (changeImageRequirements.js). Only a source
// the user selects is taken up: the bands it provides become the image's, its band kept, or chosen where none is.
export class ImageForm extends Component {
    // What the latest read of the selected source answered, never saved: null while none has.
    state = {available: null, loadedRecipe: null}

    render() {
        const {input, inputComponent, labelButtons, inputs: {band, legendEntries}} = this.props
        const {available, loadedRecipe} = this.state
        const bandOptions = bandOptionsOf(Object.keys(available || {}), band.value)
        return (
            <Layout>
                <div ref={this.element} className={styles.inputComponent}>
                    {React.createElement(inputComponent, {
                        input,
                        labelButtons,
                        onLoading: () => this.setState({available: null}),
                        onLoaded: ({id, bands, metadata, visualizations, recipe}) => this.onLoaded(id, bands, metadata, visualizations, recipe),
                        onError: error => showLoadError(input, error)
                    })}
                </div>
                <FormCombo
                    label={msg('process.classChange.panel.inputImage.changeBand.label')}
                    input={band}
                    disabled={!bandOptions.length}
                    options={bandOptions}
                />
                <Legend
                    label={msg('process.classChange.panel.inputImage.legend.label')}
                    recipe={loadedRecipe}
                    band={band.value}
                    entries={legendEntries.value || []}
                    disabled={!band.value}
                    onUpdate={updatedEntries => legendEntries.set(updatedEntries)}
                    errorMessage={legendEntries.error}
                />
            </Layout>
        )
    }

    componentDidUpdate(prevProps) {
        const {inputs: {band: {value: prevBand}}} = prevProps
        const {inputs: {band: {value: band}}} = this.props
        if (band && band !== prevBand) {
            this.bandSelected(band)
        }
    }

    // Another band chosen: its legend starts from the categorical style its source gives it.
    bandSelected(band) {
        const {inputs: {bands, legendEntries}} = this.props
        const {available} = this.state
        const visualization = (available || bands.value || {})[band]
        if (available) {
            bands.set(available)
        }
        const entries = ((visualization && visualization.values) || [])
            .map((value, i) => {
                return {
                    id: uuid(),
                    color: (visualization.palette && visualization.palette[i]) || '#000000',
                    value,
                    label: (visualization.labels && visualization.labels[i]) || `${value}`,
                }
            })
        legendEntries.set(entries)
    }

    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations, loadedRecipe) {
        const {input, inputs: {band, bands, metadata, visualizations}} = this.props
        if (!id) {
            return
        }
        this.setState({available: loadedBands, loadedRecipe})
        if (!input.isDirty()) {
            metadata.setInitialValue(loadedMetadata)
            visualizations.setInitialValue(loadedVisualizations)
            return
        }
        bands.set(loadedBands)
        if (!band.value) {
            const bandNames = Object.keys(loadedBands)
            const defaultBand = bandNames.find(bandName => loadedBands[bandName].values?.length) || bandNames[0]
            band.set(defaultBand)
        }
        metadata.set(loadedMetadata)
        visualizations.set(loadedVisualizations)
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any,
    labelButtons: PropTypes.array
}
