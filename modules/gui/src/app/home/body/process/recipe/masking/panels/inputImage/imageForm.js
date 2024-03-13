import {Layout} from '~/widget/layout'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import styles from './inputImage.module.css'

export class ImageForm extends Component {
    state = {errorBandCleared: true}

    render() {
        const {input, inputComponent, inputs: {bands}} = this.props
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

    }

    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {form, inputs: {bands, metadata, visualizations}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        bands.set(loadedBands)
        metadata.set(loadedMetadata)
        visualizations.set(loadedVisualizations)
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any
}
