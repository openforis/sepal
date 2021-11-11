import * as PropTypes from 'prop-types'
import {BandSetSpec} from './bandSetSpec'
import {Layout} from 'widget/layout'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {mutate} from 'stateUtils'
import {withScrollable} from 'widget/scrollable'
import BlurDetector from 'widget/blurDetector'
import Label from 'widget/label'
import React, {Component} from 'react'
import _ from 'lodash'
import styles from './inputImage.module.css'

class ImageForm extends Component {
    state = {
        selectedSpecId: null,
        prevBandSetSpecs: [],
    }
    element = React.createRef()

    static getDerivedStateFromProps(props, state) {
        const {inputs: {bandSetSpecs, bands}} = props
        const {prevBandSetSpecs = [], selectedSpecId} = state
        const nextBandSetSpecs = bandSetSpecs.value
        if (!bands.value || !nextBandSetSpecs || !nextBandSetSpecs.length)
            return state
        const nextState = {...state}
        if (!_.isEqual(nextBandSetSpecs, prevBandSetSpecs)) {
            const addedSpec = nextBandSetSpecs.length - prevBandSetSpecs.length === 1
            if (addedSpec) {
                const lastSpec = _.last(nextBandSetSpecs)
                if (BandSetSpec.isEmpty(lastSpec, bands.value)) {
                    nextState.selectedSpecId = lastSpec.id
                }
            } else {
                const emptySpec = !nextBandSetSpecs.find(spec => !BandSetSpec.isEmpty(spec, bands.value))
                if (emptySpec && !selectedSpecId)
                    nextState.selectedSpecId = nextBandSetSpecs[0].id
            }
            nextState.addedBandSetSpec = addedSpec
        }
        return nextState
    }

    render() {
        const {input, inputComponent, inputs: {bands}} = this.props
        return (
            <Layout>
                <div ref={this.element}>
                    {React.createElement(inputComponent, {
                        input,
                        onLoading: () => {
                            bands.set(null)
                        },
                        onLoaded: ({id, bands, metadata, visualizations}) => this.onLoaded(id, bands, metadata, visualizations)
                    })}
                </div>
                <div>
                    {bands.value && this.renderBandSetSpecs()}
                </div>
            </Layout>
        )
    }

    componentDidUpdate() {
        const {scrollable, inputs: {bandSetSpecs}} = this.props
        const {prevBandSetSpecs, addedBandSetSpec} = this.state
        if (bandSetSpecs.value !== prevBandSetSpecs)
            this.setState({prevBandSetSpecs: bandSetSpecs.value})

        if (addedBandSetSpec) {
            scrollable.scrollToBottom()
        }

    }

    renderBandSetSpecs() {
        const {inputs: {bandSetSpecs}} = this.props
        return (
            <React.Fragment>
                <Label msg={'Included bands'}/>
                {(bandSetSpecs.value || []).map(bandSetSpec => this.renderBandSetSpec(bandSetSpec))}
            </React.Fragment>
        )
    }

    renderBandSetSpec(bandSetSpec) {
        const {selectedSpecId} = this.state
        const selected = selectedSpecId === bandSetSpec.id
        return (
            <SuperButton
                key={bandSetSpec.id}
                title={BandSetSpec.renderTitle(bandSetSpec)}
                description={BandSetSpec.renderDescription(bandSetSpec)}
                className={selected ? styles.selectedBandSetSpec : null}
                unsafeRemove
                removeDisabled={bandSetSpec.type === 'IMAGE_BANDS'}
                onClick={() => this.editBandSetSpec(bandSetSpec)}
                onRemove={() => this.removeBandSetSpec(bandSetSpec)}
                expanded={selected}
            >
                {this.renderBandSetSpecEditor(bandSetSpec)}
            </SuperButton>
        )
    }

    renderBandSetSpecEditor(bandSetSpec) {
        const {inputs: {bands}} = this.props
        return (
            <BlurDetector
                onBlur={() => this.setState({selectedSpecId: null})}>
                <div className={styles.widget}>
                    {
                        BandSetSpec.renderEditor({
                            bandSetSpec,
                            availableBands: bands.value,
                            onChange: bandSetSpec => this.updateBandSetSpec(bandSetSpec)
                        })
                    }
                </div>
            </BlurDetector>
        )

    }

    editBandSetSpec(bandSetSpec) {
        this.setState({selectedSpecId: bandSetSpec.id})
    }

    updateBandSetSpec(bandSetSpec) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, {id: bandSetSpec.id}).set(bandSetSpec)
        bandSetSpecs.set(updated)
    }

    removeBandSetSpec(bandSetSpec) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, {id: bandSetSpec.id}).del()
        bandSetSpecs.set(updated)
    }

    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {form, inputs: {bands, bandSetSpecs, metadata, visualizations}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        const filteredSpecs = bandSetSpecs.value
            .map(spec => BandSetSpec.filter(spec, loadedBands))
            .filter((spec, i) => !BandSetSpec.isEmpty(spec, loadedBands) || i === 0)
        bandSetSpecs.set(filteredSpecs)
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

export default compose(
    ImageForm,
    withScrollable()
)
