import {BandSetSpec} from './bandSetSpec'
import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Combo} from 'widget/combo'
import {CrudItem} from 'widget/crudItem'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {compose} from 'compose'
import {msg} from 'translate'
import {mutate} from 'stateUtils'
import ButtonPopup from 'widget/buttonPopup'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import _ from 'lodash'

class ImageForm extends Component {
    state = {loading: false}
    render() {
        const {inputs: {bands, bandSetSpecs}} = this.props
        const {loading} = this.state
        return (
            <Layout
                type='vertical'
                spacing='compact'>
                {this.renderInput()}
                {!loading && bandSetSpecs.value?.length && bands.value?.length
                    ? bandSetSpecs.value.map(bandSetSpec =>
                        this.renderBandSetSpec(bandSetSpec)
                    )
                    : null}
            </Layout>
        )
    }

    renderInput() {
        const {input, inputComponent} = this.props
        const {loading} = this.state
        return React.createElement(inputComponent, {
            input,
            busy: loading,
            onLoading: () => {
                this.setState({loading: true})
            },
            onLoaded: ({id, bands, metadata, visualizations}) => this.onLoaded(id, bands, metadata, visualizations)
        })
    }

    renderBandSetSpec(bandSetSpec) {
        return (
            <ListItem
                key={bandSetSpec.id}
                expanded={bandSetSpec.included.length}
                expansion={this.renderSelection(bandSetSpec)}>
                <CrudItem
                    title={BandSetSpec.renderTitle(bandSetSpec)}
                    inlineComponents={this.renderAddButton(bandSetSpec)}
                    unsafeRemove
                    removeDisabled={bandSetSpec.type === 'IMAGE_BANDS'}
                    onRemove={() => this.removeBandSetSpec(bandSetSpec)}
                />
            </ListItem>
        )
    }

    renderSelection(bandSetSpec) {
        return (
            <ButtonGroup>
                {bandSetSpec.included.map(value =>
                    <Button
                        key={value}
                        label={value}
                        size='small'
                        air='less'
                        onClick={() => this.removeSelection(bandSetSpec, value)}
                        icon='times'
                    />
                )}
            </ButtonGroup>
        )
    }

    renderAddButton(bandSetSpec) {
        const {inputs: {bands}} = this.props
        const options = BandSetSpec
            .options(bandSetSpec, bands.value)
            .filter(({value}) => !bandSetSpec.included.includes(value))
        return (
            <ButtonPopup
                shape='circle'
                chromeless
                icon='plus'
                noChevron
                showPopupOnMount={!bandSetSpec.included.length && bands.value?.length}
                vPlacement='below'
                hPlacement='over-left'
                tooltip={msg('process.classification.panel.inputImagery.bandSetSpec.addBands.tooltip')}>
                {onBlur => (
                    <Combo
                        alignment='left'
                        placeholder={msg('process.classification.panel.inputImagery.bandSetSpec.addBands.placeholder')}
                        options={options}
                        stayOpenOnSelect
                        autoOpen
                        autoFocus
                        allowClear
                        onCancel={onBlur}
                        onChange={({value}) => {
                            this.addSelection(bandSetSpec, value)
                        }}
                    />
                )}
            </ButtonPopup>
        )
    }

    componentDidUpdate(prevProps) {
        const {inputs: {section: prevSection, bands, bandSetSpecs}} = prevProps
        const {inputs: {section}} = this.props

        if (prevSection.value !== section.value) {
            bands.set(null)
            bandSetSpecs.set(null)
        }
    }

    addSelection(bandSetSpec, value) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, [{id: bandSetSpec.id}, 'included']).push(value)
        bandSetSpecs.set(updated)
    }

    removeSelection(bandSetSpec, value) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, [{id: bandSetSpec.id}, 'included', value]).del()
        bandSetSpecs.set(updated)
    }

    removeBandSetSpec(bandSetSpec) {
        const {inputs: {bandSetSpecs}} = this.props
        const updated = mutate(bandSetSpecs.value, {id: bandSetSpec.id}).del()
        bandSetSpecs.set(updated)
    }

    onLoaded(id, loadedBands, loadedMetadata, loadedVisualizations) {
        const {form, inputs: {bands, bandSetSpecs, metadata, visualizations}} = this.props
        this.setState({loading: false})
        if (!id || !form.isDirty()) {
            return
        }
        const filteredSpecs = bandSetSpecs.value
            .filter((spec, i) => !BandSetSpec.isEmpty(spec, loadedBands) || i === 0)
            .map(spec => ({...spec, included: BandSetSpec.filter(spec, loadedBands)}))

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
    ImageForm
)
