import api from 'api'
import * as PropTypes from 'prop-types'
import React, {Component} from 'react'
import {mutate, selectFrom} from 'stateUtils'
import {msg} from 'translate'
import BlurDetector from 'widget/blurDetector'
import Label from 'widget/label'
import {CenteredProgress} from 'widget/progress'
import SuperButton from 'widget/superButton'
import {filterBandSetSpec, isBandSetSpecEmpty, renderBandSetSpec, renderBandSetSpecEditor} from './bandSetSpec'
import styles from './inputImage.module.css'

class ImageForm extends Component {
    state = {
        edit: null,
        prevBandSetSpecs: []
    }

    // static getDerivedStateFromProps(props, state) {
    //     const {inputs: {bandSetSpecs}} = props
    //     const {prevBandSetSpecs = []} = state
    //     const nextBandSetSpecs = bandSetSpecs.value || []
    //     const nextState = {...state}
    //     if (!_.isEqual(nextBandSetSpecs, prevBandSetSpecs)) {
    //         const addedSpec = nextBandSetSpecs.length > prevBandSetSpecs.length
    //         if (addedSpec) {
    //             const lastSpec = _.last(nextBandSetSpecs)
    //             if (isBandSetSpecEmpty(lastSpec)) {
    //                 console.log('Added')
    //                 nextState.edit = lastSpec.id
    //             }
    //         } else if (!nextBandSetSpecs.find(spec => !isBandSetSpecEmpty(spec))) {
    //             console.log('All empty')
    //             nextState.edit = nextBandSetSpecs[0].id
    //         }
    //     }
    //     return nextState
    // }

    render() {
        const {stream, input, inputComponent, inputs: {bands}} = this.props
        return (
            <React.Fragment>
                <div className={styles.inputComponent}>
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
        const {prevBandSetSpecs} = this.state
        if (bandSetSpecs.value !== prevBandSetSpecs)
            this.setState({prevBandSetSpecs: bandSetSpecs.value})
    }

    renderBandSetSpecs() {
        const {inputs: {bandSetSpecs}} = this.props
        const {edit} = this.state
        return (
            <React.Fragment>
                <Label msg={'Included bands'}/>
                {(bandSetSpecs.value || []).map(bandSetSpec => {
                        const editing = edit === bandSetSpec.id

                        return <SuperButton
                            key={bandSetSpec.id}
                            title={bandSetSpec.type}
                            description={renderBandSetSpec(bandSetSpec)}
                            className={editing ? styles.edit : null}
                            unsafeRemove
                            onClick={() => this.editBandSetSpec(bandSetSpec)}
                            onRemove={() => this.removeBandSetSpec(bandSetSpec)}
                        >
                            {editing ? this.renderBandSetSpecEditor(bandSetSpec) : null}
                        </SuperButton>
                    }
                )}
            </React.Fragment>
        )
    }

    renderBandSetSpecEditor(bandSetSpec) {
        const {inputs: {bands}} = this.props
        return (
            <BlurDetector
                className={styles.bandSetSpecEditor}
                onBlur={() => this.setState({edit: null})}>
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

    //
    // renderBandSetSpec(bandSetSpec) {
    //     return (
    //         <div
    //             className={[styles.item, lookStyles.look, lookStyles.transparent].join(' ')}>
    //             <div className={styles.itemInfo}>
    //                 <div className='itemType'>{bandSetSpec.type}</div>
    //                 {renderBandSetSpec(bandSetSpec)}
    //             </div>
    //             <Button
    //                 chromeless
    //                 shape='circle'
    //                 size='large'
    //                 icon='trash'
    //                 disabled={bandSetSpec.type === 'IMAGE_BANDS'}
    //                 onClick={() => this.removeBandSetSpec(bandSetSpec)}/>
    //         </div>
    //     )
    // }

    editBandSetSpec(bandSetSpec) {
        this.setState({edit: bandSetSpec.id})
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
                const errorMessage = selectFrom(error, 'response.message') || msg('some error') // TODO: Fix error message
                input.setInvalid(errorMessage)
            }
        )
    }
}

ImageForm.propTypes = {
    inputs: PropTypes.any,
    inputComponent: PropTypes.any,
    children: PropTypes.any
}

export default ImageForm


