import * as PropTypes from 'prop-types'
import {CenteredProgress} from 'widget/progress'
import {filterBandSetSpec, isBandSetSpecEmpty, renderBandSetSpec, renderBandSetSpecEditor} from './bandSetSpec'
import {msg} from 'translate'
import {mutate, selectFrom} from 'stateUtils'
import BlurDetector from 'widget/blurDetector'
import Label from 'widget/label'
import React, {Component} from 'react'
import SuperButton from 'widget/superButton'
import api from 'api'
import styles from './inputImage.module.css'
import _ from 'lodash'

class ImageForm extends Component {
    state = {
        selectedSpecId: null,
        prevBandSetSpecs: [],
    }
    element = React.createRef()

    static getDerivedStateFromProps(props, state) {
        const {inputs: {bandSetSpecs, bands}} = props
        if (!bands.value)
            return state
        const {prevBandSetSpecs = [], selectedSpecId} = state
        const nextBandSetSpecs = bandSetSpecs.value || []
        const nextState = {...state}
        if (!_.isEqual(nextBandSetSpecs, prevBandSetSpecs)) {
            const addedSpec = nextBandSetSpecs.length - prevBandSetSpecs.length === 1
            if (addedSpec) {
                const lastSpec = _.last(nextBandSetSpecs)
                if (isBandSetSpecEmpty(lastSpec, bands.value)) {
                    nextState.selectedSpecId = lastSpec.id
                }
            } else {
                const emptySpec = !nextBandSetSpecs.find(spec => !isBandSetSpecEmpty(spec, bands.value))
                if (emptySpec && !selectedSpecId)
                    nextState.selectedSpecId = nextBandSetSpecs[0].id
            }
            nextState.addedBandSetSpec = addedSpec
        }
        return nextState
    }

    render() {
        const {stream, input, inputComponent, inputs: {bands}} = this.props
        return (
            <React.Fragment>
                <div ref={this.element} className={styles.inputComponent}>
                    {React.createElement(inputComponent, {
                        input,
                        onChange: id => this.onImageSelection(id)
                    })}
                </div>
                <div>
                    {stream('LOAD_IMAGE_BANDS').active
                        ? <CenteredProgress
                            title={msg('process.classification.panel.inputImagery.loadingBands')}
                            className={styles.loadingProgress}/>
                        : bands.value && bands.value.length
                            ? this.renderBandSetSpecs()
                            : null
                    }
                </div>
            </React.Fragment>
        )
    }

    componentDidUpdate() {
        const {inputs: {bandSetSpecs}} = this.props
        const {prevBandSetSpecs, addedBandSetSpec} = this.state
        if (bandSetSpecs.value !== prevBandSetSpecs)
            this.setState({prevBandSetSpecs: bandSetSpecs.value})

        if (addedBandSetSpec) {
            const scrollable = this.element.current.closest('.scrollable')
            scrollable.scrollTop = scrollable.scrollHeight
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
                title={bandSetSpec.type}
                description={renderBandSetSpec(bandSetSpec)}
                className={selected ? styles.selectedBandSetSpec : null}
                unsafeRemove
                removeDisabled={bandSetSpec.type === 'IMAGE_BANDS'}
                onClick={() => this.editBandSetSpec(bandSetSpec)}
                onRemove={() => this.removeBandSetSpec(bandSetSpec)}
                selected={selected}
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
                        renderBandSetSpecEditor({
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

    onImageSelection(id) {
        const {stream, form, input, inputs: {section, bands, bandSetSpecs}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        const image = {recipe: {type: section.value, id}}
        bands.set([])
        stream('LOAD_IMAGE_BANDS', api.gee.bands$(image),
            loadedBands => {
                const filteredSpecs = bandSetSpecs.value
                    .map(spec => filterBandSetSpec(spec, loadedBands))
                    .filter((spec, i) => !isBandSetSpecEmpty(spec, loadedBands) || i === 0)
                bandSetSpecs.set(filteredSpecs)
                bands.set(loadedBands)
            },
            error => {
                const errorMessage = selectFrom(error, 'response.message')
                    || msg('process.classification.panel.inputImagery.loadingBandsError')
                input.setInvalid(errorMessage)
            }
        )
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any
}

export default ImageForm


