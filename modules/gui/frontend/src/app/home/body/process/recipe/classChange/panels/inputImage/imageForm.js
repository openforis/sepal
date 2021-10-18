import * as PropTypes from 'prop-types'
import {FormButtons} from '../../../../../../../../widget/form/buttons'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {msg} from '../../../../../../../../translate'
import {withScrollable} from 'widget/scrollable'
import React, {Component} from 'react'
import styles from './inputImage.module.css'

class ImageForm extends Component {
    render() {
        const {input, inputComponent, inputs: {band, bands}} = this.props
        const bandOptions = (Object.keys(bands.value) || [])
            .filter(bandName => bands.value[bandName].values.length) // TODO: For now, remove options without values. Later, allow user to specify values
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
                <FormButtons
                    label={msg('process.classChange.panel.inputImage.changeBand.label')}
                    input={band}
                    disabled={!bandOptions.length}
                    options={bandOptions}
                />
            </Layout>
        )
    }

    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {form, inputs: {band, bands, metadata, visualizations}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        bands.set(loadedBands)
        const bandNames = Object.keys(loadedBands)
        const selectedBand = band.value
        if (!selectedBand || !bandNames.includes(selectedBand)) {
            const defaultBand = bandNames.find(bandName => loadedBands[bandName].values.length)
                || bandNames[0]
            band.set(defaultBand)
        }
        metadata.set(loadedMetadata)
        visualizations.set(loadedVisualizations)
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
