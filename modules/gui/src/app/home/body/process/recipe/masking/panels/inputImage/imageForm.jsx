import _ from 'lodash'
import PropTypes from 'prop-types'
import React, {Component} from 'react'

import {withKnownIdentities} from '~/app/home/body/process/recipe/visualizationMatching'
import {Layout} from '~/widget/layout'

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

    // What the source has now, matched against what the form holds. Three things govern whether it is
    // written back.
    //
    // The answer must be about the source that is selected NOW. A user who changes the selection while a
    // load is in flight would otherwise have the previous source's bands written under the new source's id.
    //
    // Its styles keep the identities this recipe already knows them by. The asset picker identifies what it
    // parses afresh on every read, so an untouched source comes back wearing new ids; applying those would
    // rewrite the model with identities no saved selection names, and the selection would go stale on a
    // source that never changed.
    //
    // And a form that is neither dirty nor stale is left alone. Reopening a saved recipe reloads its source,
    // and writing an identical answer back would mark an untouched panel as edited. When the answer does
    // differ, the copied snapshot has gone stale against the source and refreshing it is the point.
    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {form, input, inputs: {bands, metadata, visualizations}} = this.props
        if (!id || id !== input.value) {
            return
        }
        const identified = withKnownIdentities(loadedVisualizations, visualizations.value)
        if (!form.isDirty()
            && _.isEqual(bands.value, loadedBands)
            && _.isEqual(visualizations.value, identified)) {
            return
        }
        bands.set(loadedBands)
        metadata.set(loadedMetadata)
        visualizations.set(identified)
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    input: PropTypes.object,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any
}
