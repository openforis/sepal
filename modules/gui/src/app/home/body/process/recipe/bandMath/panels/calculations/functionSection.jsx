import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {ButtonPopup} from '~/widget/buttonPopup'
import {Combo} from '~/widget/combo'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'

import {withRecipe} from '../../../../recipeContext'
import styles from './calculation.module.css'

const ADD_ALL_BANDS = Symbol('addAllBands')

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || [],
    calculations: selectFrom(recipe, 'model.calculations.calculations') || [],
})

class _FunctionSection extends React.Component {
    state = {bandOptions: [], bandIds: []}

    constructor(props) {
        super(props)
        this.updateUsedBands = this.updateUsedBands.bind(this)
    }

    render() {
        return (
            <Layout type='vertical'>
                <Layout type='horizontal' alignment='distribute'>
                    {this.renderName()}
                    {this.renderDataType()}
                </Layout>
                <Layout type='horizontal' alignment='distribute'>
                    {this.renderReducer()}
                    {this.renderBandName()}
                </Layout>
                {this.renderBands()}
            </Layout>
        )
    }

    renderName() {
        const {inputs: {name}} = this.props
        return (
            <Form.Input
                className={styles.name}
                label={msg('process.bandMath.panel.calculations.form.calculationName.label')}
                placeholder={msg('process.bandMath.panel.calculations.form.calculationName.placeholder')}
                tooltip={msg('process.bandMath.panel.calculations.form.calculationName.tooltip')}
                input={name}
                autoComplete={false}
            />
        )
    }

    renderDataType() {
        const {inputs: {dataType}} = this.props
        const options = [
            {value: 'auto', label: msg('process.bandMath.panel.calculations.form.dataType.auto')},
            {value: 'int8', label: msg('process.bandMath.panel.calculations.form.dataType.int8')},
            {value: 'int16', label: msg('process.bandMath.panel.calculations.form.dataType.int16')},
            {value: 'int32', label: msg('process.bandMath.panel.calculations.form.dataType.int32')},
            {value: 'int64', label: msg('process.bandMath.panel.calculations.form.dataType.int64')},
            {value: 'uint8', label: msg('process.bandMath.panel.calculations.form.dataType.uint8')},
            {value: 'uint16', label: msg('process.bandMath.panel.calculations.form.dataType.uint16')},
            {value: 'uint32', label: msg('process.bandMath.panel.calculations.form.dataType.uint32')},
            {value: 'byte', label: msg('process.bandMath.panel.calculations.form.dataType.byte')},
            {value: 'short', label: msg('process.bandMath.panel.calculations.form.dataType.short')},
            {value: 'int', label: msg('process.bandMath.panel.calculations.form.dataType.int')},
            {value: 'long', label: msg('process.bandMath.panel.calculations.form.dataType.long')},
            {value: 'float', label: msg('process.bandMath.panel.calculations.form.dataType.float')},
            {value: 'double', label: msg('process.bandMath.panel.calculations.form.dataType.double')},
        ]
        return (
            <Form.Combo
                label={msg('process.bandMath.panel.calculations.form.dataType.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.dataType.tooltip')}
                input={dataType}
                options={options}
                placeholder={msg('process.bandMath.panel.calculations.form.dataType.label')}
            />
        )
    }

    renderBands() {
        const {inputs: {usedBands}} = this.props
        const {bandOptions} = this.state
        const selected = (usedBands.value || []).map(({imageId, id}) =>
            this.toUniqueBandId(imageId, id)
        )
        return (
            <Form.FieldSet
                label={msg('process.bandMath.panel.calculations.form.usedBands.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.usedBands.tooltip')}>
                <Layout type='vertical' spacing='tight'>
                    {bandOptions.map(group => this.renderBandGroup(group, selected))}
                </Layout>
            </Form.FieldSet>
        )
    }

    renderBandGroup(group, selected) {
        const selectedOptions = group.options.filter(({value}) => selected.includes(value))
        return (
            <ListItem
                key={group.key || group.label}
                expanded
                expansion={this.renderBandSelection(selectedOptions, selected)}>
                <CrudItem
                    title={group.label}
                    inlineComponents={this.renderAddBandButton(group, selected)}
                    removeConfirmationLabel={msg('button.removeAll')}
                    removeDisabled={!selectedOptions.length}
                    onRemove={() => this.removeGroupBands(group, selected)}
                />
            </ListItem>
        )
    }

    renderBandSelection(selectedOptions, selected) {
        return (
            <ButtonGroup>
                {selectedOptions.length
                    ? selectedOptions.map(({value, label}) =>
                        <Button
                            key={value}
                            label={label}
                            size='small'
                            air='less'
                            icon='times'
                            onClick={() => this.removeBand(value, selected)}
                        />
                    )
                    : <NoData message={msg('process.panels.inputImagery.form.noBands')}/>
                }
            </ButtonGroup>
        )
    }

    renderAddBandButton(group, selected) {
        const options = group.options.filter(({value}) => !selected.includes(value))
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
                disabled={!options.length}>
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
                        onChange={({value}) => value === ADD_ALL_BANDS
                            ? this.addBands(options, selected)
                            : this.addBands(options.filter(option => option.value === value), selected)}
                    />
                )}
            </ButtonPopup>
        )
    }

    renderReducer() {
        const {inputs: {reducer}} = this.props
        const options = [
            {key: '0', options: [
                {value: 'sum', label: 'sum'},
                {value: 'product', label: 'product'},
            ]},
            {key: '1', options: [
                {value: 'max', label: 'max'},
                {value: 'min', label: 'min'},
            ]},
            {key: '2', options: [
                {value: 'mean', label: 'mean'},
                {value: 'median', label: 'median'},
                {value: 'mode', label: 'mode'},
            ]},
            {key: '3', options: [
                {value: 'stdDev', label: 'stdDev'},
                {value: 'variance', label: 'variance'},
            ]},
            {key: '4', options: [
                {value: 'firstNonNull', label: 'first'},
                {value: 'lastNonNull', label: 'last'},
            ]},
            {key: '5', options: [
                {value: 'count', label: 'count'},
                {value: 'countDistinctNonNull', label: 'countDistinctNonNull'},
            ]}
        ]
        return (
            <Form.Combo
                label={msg('process.bandMath.panel.calculations.form.function.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.function.tooltip')}
                input={reducer}
                options={options}
                placeholder={msg('process.bandMath.panel.calculations.form.function.label')}
                autoFocus
                onChange={this.updateDefaultName}
            />
        )
    }

    renderBandName() {
        const {inputs: {bandName, defaultBandName}} = this.props
        return (
            <Form.Input
                label={msg('process.bandMath.panel.calculations.form.bandName.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.bandName.tooltip')}
                input={bandName}
                placeholder={defaultBandName.value || msg('process.bandMath.panel.calculations.form.bandName.placeholder')}
                autoComplete={false}
            />
        )
    }

    componentDidMount() {
        const {images, calculations, inputs: {imageId}} = this.props
        const calculationIndex = calculations.findIndex(calculation => calculation.imageId === imageId.value)
        const availableCalculations = calculationIndex >= 0
            ? calculations.slice(0, calculationIndex)
            : calculations
        const imageOptions = images.map(image => ({
            key: image.imageId,
            label: image.name,
            options: image.includedBands.map(band => ({
                value: this.toUniqueBandId(image.imageId, band.id),
                label: band.name,
                band: {...band, imageId: image.imageId, imageName: image.name}
            }))
        }))

        const calculationOptions = availableCalculations.map(calculation => ({
            key: calculation.imageId,
            label: calculation.name,
            options: calculation.includedBands.map(band => ({
                value: this.toUniqueBandId(calculation.imageId, band.id),
                label: band.name,
                band: {...band, imageId: calculation.imageId, imageName: calculation.name},
            }))
        }))
        const bandOptions = [...imageOptions, ...calculationOptions]
        this.setState({bandOptions})
    }

    componentDidUpdate() {
        const {inputs: {reducer, defaultBandName}} = this.props
        if (defaultBandName.value !== reducer.value) {
            defaultBandName.set(reducer.value)
        }
    }

    updateUsedBands(bandIds) {
        const {inputs: {usedBands}} = this.props
        const {bandOptions} = this.state

        const bands = bandOptions
            .map(({options}) => options)
            .flat()
            .filter(({value}) => bandIds.includes(value))
            .map(({band}) => band)
        usedBands.set(bands)
    }

    addBands(options, selected) {
        this.updateUsedBands([
            ...selected,
            ...options
                .map(({value}) => value)
                .filter(value => !selected.includes(value))
        ])
    }

    removeBand(value, selected) {
        this.updateUsedBands(selected.filter(selectedValue => selectedValue !== value))
    }

    removeGroupBands(group, selected) {
        const groupBandIds = group.options.map(({value}) => value)
        const groupBandIdSet = new Set(groupBandIds)
        this.updateUsedBands(selected.filter(value => !groupBandIdSet.has(value)))
    }

    toUniqueBandId(imageId, bandId) {
        return `${imageId}|${bandId}`
    }

}

export const FunctionSection = compose(
    _FunctionSection,
    withRecipe(mapRecipeToProps)
)

FunctionSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
