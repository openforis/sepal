import _ from 'lodash'
import PropTypes from 'prop-types'
import React, {Component} from 'react'

import {msg} from '~/translate'
import {ButtonPopup} from '~/widget/buttonPopup'
import {Combo} from '~/widget/combo'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'

import {bandsAvailableToAdd, defaultBand} from './bands'
import {BandSpec} from './bandSpec'
import styles from './inputImage.module.css'

const ADD_ALL_BANDS = Symbol('addAllBands')

export class ImageForm extends Component {
    state = {
        loadedRecipe: null,
        selected: undefined,
    }

    render() {
        return (
            <Layout type={'vertical'}>
                {this.renderName()}
                {this.renderImageSelector()}
                {this.renderIncludedBands()}
            </Layout>
        )
    }

    renderName() {
        const {inputs: {name}} = this.props
        return (
            <Form.Input
                className={styles.name}
                label={msg('process.bandMath.panel.inputImagery.name.label')}
                tooltip={msg('process.bandMath.panel.inputImagery.name.tooltip')}
                input={name}
                autoComplete={false}
            />
        )
    }

    renderImageSelector() {
        const {input, inputComponent, inputs: {bands}} = this.props
        return <div ref={this.element}>
            {React.createElement(inputComponent, {
                input,
                onLoading: () => {
                    bands.set({})
                },
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
        const {inputs: {bands, includedBands}} = this.props
        const {loadedRecipe, selected} = this.state
        const availableBands = bandsAvailableToAdd(bands.value, includedBands.value)
        const bandSpecs = (includedBands.value || []).map(bandSpec =>
            <BandSpec
                key={bandSpec.name}
                bands={_.omit(bands.value, Object.keys(bands.value)
                    .filter(name => ![bandSpec.name, ...availableBands].includes(name))) || {}}
                recipe={loadedRecipe}
                spec={bandSpec}
                selected={selected === bandSpec.id}
                disabled={!Object.keys(bands.value).length}
                onClick={id => this.selectBandSpec(id)}
                onUpdate={spec => this.updateSpec(spec)}
                onRemove={id => this.removeBandSpec(id)}/>
        )
        return (
            <Layout type='vertical' spacing='tight'>
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
        const options = availableBands.map(name => ({value: name, label: name}))
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

    componentDidUpdate(prevProps) {
        const {inputs: {includedBands: prevIncludedBands}} = prevProps
        const {inputs: {includedBands}} = this.props
        if ((includedBands.value || []).length > (prevIncludedBands.value || []).length) {
            // A band was added - select last
            this.selectBandSpec(includedBands.value[includedBands.value.length - 1].id)
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

    selectBandSpec(bandSpecId) {
        this.setState(({selected}) => ({
            selected: selected === bandSpecId ? null : bandSpecId
        }))
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

    addBand(name) {
        this.addBands([name])
    }

    addAllBands(names) {
        this.addBands(names)
    }

    addBands(names) {
        const {inputs: {bands, includedBands}} = this.props
        includedBands.set([
            ...(includedBands.value || []),
            ...names.map(name => defaultBand(name, bands.value))
        ])
    }

    onLoaded(id, loadedBands, loadedVisualizations, loadedRecipe) {
        const {form, inputs: {bands, visualizations, recipe, includedBands}} = this.props
        if (!id || !form.isDirty()) {
            return
        }
        bands.set(loadedBands)
        visualizations.set(loadedVisualizations)
        recipe.set(loadedRecipe.id)
        this.setState({loadedRecipe})
        if (!includedBands.value?.length) {
            this.addFirstBand(loadedBands)
        }
        
    }

    addFirstBand(loadedBands) {
        const {inputs: {includedBands}} = this.props
        const availableBands = bandsAvailableToAdd(loadedBands, includedBands.value)
        const bandSpec = defaultBand(availableBands[0], loadedBands)
        includedBands.set([bandSpec])
        this.setState({selected: bandSpec.id})
    }
}

ImageForm.propTypes = {
    children: PropTypes.any,
    inputComponent: PropTypes.any,
    inputs: PropTypes.any
}
