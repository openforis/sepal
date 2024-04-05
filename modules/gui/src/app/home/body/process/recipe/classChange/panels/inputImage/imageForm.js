import {FormCombo} from '~/widget/form/combo'
import {Layout} from '~/widget/layout'
import {Legend} from '~/widget/legend/legend'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import styles from './inputImage.module.css'

export class ImageForm extends Component {
    state = {entries: [], loadedRecipe: null}

    render() {
        const {input, inputComponent, inputs: {band, bands, legendEntries}} = this.props
        const {loadedRecipe} = this.state
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
                        onLoaded: ({id, bands, metadata, visualizations, recipe}) => this.onLoaded(id, bands, metadata, visualizations, recipe)
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

    bandSelected(band) {
        const {inputs: {bands, legendEntries}} = this.props
        const visualization = bands.value[band]
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
        const {form, inputs: {band, bands, metadata, visualizations, recipe}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        bands.set(loadedBands)
        const bandNames = Object.keys(loadedBands)
        const selectedBand = band.value
        if (!selectedBand || !bandNames.includes(selectedBand)) {
            const defaultBand = bandNames
                .find(bandName => {
                    const values = loadedBands[bandName].values
                    return values && values.length
                })
                || bandNames[0]
            band.set(defaultBand)
        }
        metadata.set(loadedMetadata)
        visualizations.set(loadedVisualizations)
        recipe.set(loadedRecipe.id)
        this.setState({loadedRecipe})
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any
}
