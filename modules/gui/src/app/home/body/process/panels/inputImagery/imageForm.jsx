import PropTypes from 'prop-types'
import React, {Component} from 'react'

import {inputSourceKey} from '~/app/home/body/process/inputImages'
import {msg} from '~/translate'
import {ButtonPopup} from '~/widget/buttonPopup'
import {Combo} from '~/widget/combo'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'

import {bandsAvailableToAdd, defaultBand, defaultLegendEntries, isMissingBand} from './bands'
import {BandSpec} from './bandSpec'

const ADD_ALL_BANDS = Symbol('addAllBands')

export class ImageForm extends Component {
    state = {
        loadedRecipe: null,
        // The categorical bands whose legends are collapsed; the others show them.
        collapsed: [],
        // Whether the bands to add are offered as soon as the list shows: once, for a source just selected that answered
        // with bands, none of them selected.
        offerBands: false
    }

    render() {
        return (
            <Layout type={'vertical'} shrink>
                {this.renderImageSelector()}
                {this.renderIncludedBands()}
            </Layout>
        )
    }

    renderImageSelector() {
        const {input, inputComponent, labelButtons, inputs: {otherSources}} = this.props
        return <div ref={this.element}>
            {React.createElement(inputComponent, {
                input,
                labelButtons,
                otherSources: otherSources.value,
                onLoading: id => this.onLoading(id),
                onLoaded: ({
                    id,
                    bands,
                    visualizations,
                    recipe
                }) => this.onLoaded(id, bands, visualizations, recipe)
            })}
        </div>
    }

    renderIncludedBands() {
        const {inputs: {bands, includedBands}} = this.props
        if (!Object.keys(bands.value || {}).length) {
            return null
        }
        return (
            <ListItem
                expanded
                expansion={this.renderBandSpecs()}>
                <CrudItem
                    title={msg('process.classification.panel.inputImagery.bandSetSpec.imageBands.label')}
                    inlineComponents={this.renderAddBandButton()}
                    removeConfirmationLabel={msg('button.removeAll')}
                    removeDisabled={!includedBands.value?.length}
                    onRemove={() => this.removeAllBandSpecs()}
                />
            </ListItem>
        )
    }

    renderBandSpecs() {
        const {inputs: {bands, currentBands, includedBands}} = this.props
        const {loadedRecipe, collapsed} = this.state
        const bandSpecs = (includedBands.value || []).map(bandSpec =>
            <BandSpec
                key={bandSpec.band}
                recipe={loadedRecipe}
                spec={bandSpec}
                expanded={!collapsed.includes(bandSpec.id)}
                missing={isMissingBand(bandSpec, currentBands.value)}
                disabled={!Object.keys(bands.value).length}
                onToggle={id => this.toggleBandSpec(id)}
                onTypeChange={type => this.changeType(bandSpec, type)}
                onUpdate={spec => this.updateSpec(spec)}
                onRemove={id => this.removeBandSpec(id)}/>
        )
        return (
            <Layout type='vertical' spacing='tight' shrink>
                {bandSpecs.length
                    ? bandSpecs
                    : <NoData message={msg('process.panels.inputImagery.form.noBands')}/>
                }
            </Layout>
        )
    }

    renderAddBandButton() {
        const {inputs: {bands, includedBands}} = this.props
        const availableBands = bandsAvailableToAdd(bands.value, includedBands.value)
        const options = availableBands.map(band => ({value: band, label: band}))
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
                showPopupOnMount={this.state.offerBands}
                vPlacement='below'
                hPlacement='over-left'
                tooltip={msg('process.classification.panel.inputImagery.bandSetSpec.addBands.tooltip')}
                disabled={!availableBands.length}>
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
                                this.addAllBands(availableBands)
                            } else {
                                this.addBand(value)
                            }
                        }}
                    />
                )}
            </ButtonPopup>
        )
    }

    // The offer is taken up by the list as it first shows, then withdrawn: neither a rerender nor a draft restored, which
    // shows the list afresh, offers the bands again.
    componentDidUpdate() {
        const {inputs: {bands}} = this.props
        if (this.state.offerBands && Object.keys(bands.value || {}).length) {
            this.setState({offerBands: false})
        }
    }

    updateSpec(updatedSpec) {
        const {inputs: {includedBands}} = this.props
        includedBands.set(includedBands.value
            .map(spec => spec.id === updatedSpec.id
                ? updatedSpec
                : spec
            ))
    }

    toggleBandSpec(bandSpecId) {
        this.setState(({collapsed}) => ({
            collapsed: collapsed.includes(bandSpecId)
                ? collapsed.filter(id => id !== bandSpecId)
                : [...collapsed, bandSpecId]
        }))
    }

    // A type chosen over the source's default, in either direction. A band switched to categorical shows its legend - the
    // one it had before this form switched it to continuous, or else its source's - and one switched to continuous keeps
    // its legend aside in its kind's draft, for as long as the form is open, rather than in the model.
    changeType(spec, type) {
        if (spec.type === type) {
            return
        }
        const {inputs: {bands, setAsideLegends}} = this.props
        if (type === 'categorical') {
            const legendEntries = setAsideLegends.value?.[spec.id] || defaultLegendEntries(spec.band, bands.value || {})
            this.setState(({collapsed}) => ({collapsed: collapsed.filter(id => id !== spec.id)}))
            this.updateSpec({...spec, type, legendEntries})
        } else {
            setAsideLegends.setInitialValue({...setAsideLegends.value, [spec.id]: spec.legendEntries})
            this.updateSpec({...spec, type, legendEntries: []})
        }
    }

    removeBandSpec(bandSpecId) {
        const {inputs: {includedBands}} = this.props
        includedBands.set(
            includedBands.value.filter(spec => spec.id !== bandSpecId)
        )
    }

    removeAllBandSpecs() {
        const {inputs: {includedBands}} = this.props
        includedBands.set([])
    }

    addBand(band) {
        this.addBands([band])
    }

    addAllBands(bands) {
        this.addBands(bands)
    }

    addBands(bandNames) {
        const {inputs: {bands, includedBands}} = this.props
        includedBands.set([
            ...(includedBands.value || []),
            ...bandNames.map(band => defaultBand(band, bands.value))
        ])
    }

    // A load of another source than the configured bands were chosen against hides them until it answers. One of that
    // same source keeps showing the bands it was saved with. Either way, nothing is known missing until it answers.
    onLoading(id) {
        const {inputs: {bands, bandsSource, currentBands}} = this.props
        currentBands.setInitialValue(null)
        if (this.sourceOf(id) !== bandsSource.value) {
            bands.set({})
        }
    }

    // What the selected source turned out to have, and what that means for the bands already configured.
    //
    // The answer must be about the source selected NOW. Two loads can be in flight when a user changes their
    // mind, and Earth Engine has no obligation to answer in the order it was asked; the late one describes
    // an image nobody is looking at.
    //
    // What a source has is learned, not edited: for the source the input was saved with, it is where the form
    // started. Only a source other than the one the bands were chosen against reconciles them. A band configured
    // against the previous source is not a band of this one. It is dropped rather than left in the list looking like
    // a valid selection, while everything the new source still has is kept - switching source is not a reason to
    // discard work that remains meaningful. Of the same source, a band it no longer has stays selected, refused by
    // validation, for the user to remove.
    onLoaded(id, loadedBands, loadedVisualizations, loadedRecipe) {
        const {input, inputs: {bands, bandsSource, currentBands, visualizations}} = this.props
        if (!id || id !== input.value) {
            return
        }
        const changedSource = this.sourceOf(id) !== bandsSource.value
        const learn = (field, value) => input.isDirty() ? field.set(value) : field.setInitialValue(value)
        currentBands.setInitialValue(loadedBands)
        learn(bands, loadedBands)
        learn(visualizations, loadedVisualizations)
        if (changedSource) {
            const retained = this.reconcile(loadedBands)
            bandsSource.setInitialValue(this.sourceOf(id))
            this.setState({loadedRecipe, offerBands: !!Object.keys(loadedBands || {}).length && !retained.length})
        } else {
            this.setState({loadedRecipe})
        }
    }

    // A source of the kind the picker is for. The bands' source is kept by the form, not here: the picker starts afresh
    // whenever its kind is chosen again.
    sourceOf(id) {
        const {inputs: {section}} = this.props
        return inputSourceKey({type: section.value, id})
    }

    // A source that reports no bands is not a source whose configuration can be reconciled against
    // anything. The band list is not shown at all in that state, so what is configured is left as it is.
    reconcile(loadedBands) {
        const {inputs: {includedBands}} = this.props
        const configured = includedBands.value || []
        if (!Object.keys(loadedBands || {}).length) {
            return configured
        }
        const retained = configured.filter(({band}) => loadedBands[band])
        if (retained.length !== configured.length) {
            includedBands.set(retained)
        }
        return retained
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any,
    // Shown in the source picker's label row: the choice of the kind of source.
    labelButtons: PropTypes.array
}
