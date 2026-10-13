import PropTypes from 'prop-types'
import React, {Component} from 'react'

import {inputSourceKey} from '~/app/home/body/process/inputImages'
import {mutate} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {ButtonPopup} from '~/widget/buttonPopup'
import {Combo} from '~/widget/combo'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'

import {BandSetSpec} from './bandSetSpec'

const ADD_ALL_BANDS = Symbol('addAllBands')

export class ImageForm extends Component {
    state = {loadingSource: null}
    render() {
        const {inputs: {bandSetSpecs}} = this.props
        return (
            <Layout
                type='vertical'
                spacing='compact'>
                {this.renderInput()}
                {this.isShowingBandSets()
                    ? bandSetSpecs.value.map(bandSetSpec =>
                        this.renderBandSetSpec(bandSetSpec)
                    )
                    : null}
            </Layout>
        )
    }

    renderInput() {
        const {input, inputComponent, labelButtons, inputs: {otherSources}} = this.props
        return React.createElement(inputComponent, {
            input,
            labelButtons,
            otherSources: otherSources.value,
            busy: this.isLoadingAnotherSource(),
            onLoading: id => this.onLoading(id),
            onLoaded: ({id, bands, metadata, visualizations}) => this.onLoaded(id, bands, metadata, visualizations)
        })
    }

    renderBandSetSpec(bandSetSpec) {
        const imageBands = bandSetSpec.type === 'IMAGE_BANDS'
        return (
            <ListItem
                key={bandSetSpec.id}
                expanded={imageBands || bandSetSpec.included.length}
                expansion={this.renderSelection(bandSetSpec)}>
                <CrudItem
                    title={BandSetSpec.renderTitle(bandSetSpec)}
                    inlineComponents={this.renderAddButton(bandSetSpec)}
                    unsafeRemove={!imageBands}
                    removeConfirmationLabel={imageBands ? msg('button.removeAll') : undefined}
                    removeDisabled={imageBands && !bandSetSpec.included.length}
                    onRemove={() => imageBands
                        ? this.removeAllSelections(bandSetSpec)
                        : this.removeBandSetSpec(bandSetSpec)}
                />
            </ListItem>
        )
    }

    renderSelection(bandSetSpec) {
        return (
            <ButtonGroup>
                {bandSetSpec.included.length
                    ? bandSetSpec.included.map(value =>
                        <Button
                            key={value}
                            label={value}
                            size='small'
                            air='less'
                            onClick={() => this.removeSelection(bandSetSpec, value)}
                            icon='times'
                        />
                    )
                    : <NoData message={msg('process.panels.inputImagery.form.noBands')}/>
                }
            </ButtonGroup>
        )
    }

    renderAddButton(bandSetSpec) {
        const {inputs: {bands}} = this.props
        const options = BandSetSpec
            .options(bandSetSpec, bands.value)
            .filter(({value}) => !bandSetSpec.included.includes(value))
        const comboOptions = options.length > 1
            ? [
                {
                    key: 'add-all-bands',
                    value: ADD_ALL_BANDS,
                    label: msg('process.classification.panel.inputImagery.bandSetSpec.addBands.all.label')
                },
                ...options
            ]
            : options
        return (
            <ButtonPopup
                shape='circle'
                chromeless
                icon='plus'
                noChevron
                showPopupOnMount={!bandSetSpec.included.length && bands.value?.length}
                vPlacement='below'
                hPlacement='over-left'
                disabled={!options.length}
                tooltip={msg('process.classification.panel.inputImagery.bandSetSpec.addBands.tooltip')}>
                {onBlur => (
                    <Combo
                        alignment='left'
                        placeholder={msg('process.classification.panel.inputImagery.bandSetSpec.addBands.placeholder')}
                        options={comboOptions}
                        stayOpenOnSelect
                        autoOpen
                        autoFocus
                        allowClear
                        onCancel={onBlur}
                        onChange={({value}) => {
                            if (value === ADD_ALL_BANDS) {
                                this.addAllSelection(bandSetSpec, options)
                            } else {
                                this.addSelection(bandSetSpec, value)
                            }
                        }}
                    />
                )}
            </ButtonPopup>
        )
    }

    addSelection(bandSetSpec, value) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, [{id: bandSetSpec.id}, 'included']).push(value)
        bandSetSpecs.set(updated)
    }

    addAllSelection(bandSetSpec, options) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, [{id: bandSetSpec.id}, 'included'])
            .set([...bandSetSpec.included, ...options.map(({value}) => value)])
        bandSetSpecs.set(updated)
    }

    removeSelection(bandSetSpec, value) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, [{id: bandSetSpec.id}, 'included', value]).del()
        bandSetSpecs.set(updated)
    }

    removeAllSelections(bandSetSpec) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, [{id: bandSetSpec.id}, 'included']).set([])
        bandSetSpecs.set(updated)
    }

    removeBandSetSpec(bandSetSpec) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, {id: bandSetSpec.id}).del()
        bandSetSpecs.set(updated)
    }

    onLoading(id) {
        this.setState({loadingSource: this.sourceOf(id)})
    }

    // What the selected source has is learned, not edited: for the source the input was saved with, it is where the form
    // started. Only another source reconciles the band sets, keeping what it still offers - an image band it has, an
    // index it can derive - and the image bands set, emptied if need be. Of the same source, every set is kept as the
    // user left it, a selection it no longer has included.
    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {input, inputs: {bands, bandsSource, bandSetSpecs, metadata, visualizations}} = this.props
        this.setState({loadingSource: null})
        if (!id) {
            return
        }
        const learn = (field, value) => input.isDirty() ? field.set(value) : field.setInitialValue(value)
        learn(bands, loadedBands)
        learn(metadata, loadedMetadata)
        learn(visualizations, loadedVisualizations)
        if (this.sourceOf(id) !== bandsSource.value) {
            bandSetSpecs.set(bandSetSpecs.value
                .filter((spec, i) => !BandSetSpec.isEmpty(spec, loadedBands) || i === 0)
                .map(spec => ({...spec, included: BandSetSpec.filter(spec, loadedBands)})))
            bandsSource.setInitialValue(this.sourceOf(id))
        }
    }

    // The band sets are hidden only while another source than they were chosen against loads; one of that same source
    // shows them as they are, whether or not it answers. Selections are shown even when their source has no bands, to be
    // removed.
    isShowingBandSets() {
        const {inputs: {bands, bandSetSpecs}} = this.props
        return !this.isLoadingAnotherSource()
            && bandSetSpecs.value?.length
            && (bands.value?.length || bandSetSpecs.value.some(({included}) => included.length))
    }

    isLoadingAnotherSource() {
        const {inputs: {bandsSource}} = this.props
        const {loadingSource} = this.state
        return !!loadingSource && loadingSource !== bandsSource.value
    }

    sourceOf(id) {
        const {inputs: {section}} = this.props
        return inputSourceKey({type: section.value, id})
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any,
    // Shown in the source picker's label row: the choice of the kind of source.
    labelButtons: PropTypes.array
}
