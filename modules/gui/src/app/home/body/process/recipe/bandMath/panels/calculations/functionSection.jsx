import PropTypes from 'prop-types'
import React from 'react'

import {CALCULATION_REFERENCES, calculationItem} from '#sepal/recipe/bandMath/calculationReferences'
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
import {describeProblem} from '../../bandMathRequirements'
import styles from './calculation.module.css'

const ADD_ALL_BANDS = Symbol('addAllBands')

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images') || [],
    calculations: selectFrom(recipe, 'model.calculations.calculations') || [],
})

class _FunctionSection extends React.Component {
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
        const groups = this.bandGroups()
        return (
            <Form.FieldSet
                label={msg('process.bandMath.panel.calculations.form.usedBands.label')}
                tooltip={msg('process.bandMath.panel.calculations.form.usedBands.tooltip')}>
                <Layout type='vertical' spacing='tight'>
                    {groups.map(group => this.renderBandGroup(group))}
                </Layout>
            </Form.FieldSet>
        )
    }

    renderBandGroup(group) {
        const {selected} = group
        const problems = [...new Set(selected.flatMap(({problems}) => problems))]
        return (
            <ListItem
                key={group.key || group.label}
                expanded
                expansion={this.renderBandSelection(selected)}>
                <CrudItem
                    title={group.label}
                    error={problems.length ? problems : null}
                    inlineComponents={this.renderAddBandButton(group)}
                    removeConfirmationLabel={msg('button.removeAll')}
                    removeDisabled={!selected.length}
                    onRemove={() => this.removeGroupBands(group)}
                />
            </ListItem>
        )
    }

    renderBandSelection(selectedOptions) {
        return (
            <ButtonGroup>
                {selectedOptions.length
                    ? selectedOptions.map(({value, label, problems}) =>
                        <Button
                            key={value}
                            label={label}
                            look={problems.length ? 'cancel' : 'default'}
                            tooltip={problems.length ? problems : undefined}
                            size='small'
                            air='less'
                            icon='times'
                            onClick={() => this.removeBand(value)}
                        />
                    )
                    : <NoData message={msg('process.panels.inputImagery.form.noBands')}/>
                }
            </ButtonGroup>
        )
    }

    renderAddBandButton(group) {
        const selected = group.selected.map(({value}) => value)
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
                            ? this.addBands(options)
                            : this.addBands(options.filter(option => option.value === value))}
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

    // Scope and diagnostics come from the same rule as applied readiness. Only this draft is judged here,
    // so a different broken calculation does not prevent applying a repair.
    referenceFacts() {
        const {images, calculations, inputs: {imageId, name, usedBands}} = this.props
        const draft = {imageId: imageId.value, name: name.value, type: 'FUNCTION', usedBands: usedBands.value || []}
        const index = calculations.findIndex(calculation => calculation.imageId === draft.imageId)
        const candidates = index < 0
            ? [...calculations, draft]
            : calculations.map((calculation, i) => i === index ? draft : calculation)
        return calculationItem({images, calculations: candidates}, index < 0 ? calculations.length : index).facts
    }

    // Available choices and selected references are separate. Selections retain their saved metadata even if
    // their source disappears or a physical band comes back with a different internal ID.
    bandGroups() {
        const {images, calculations, inputs: {usedBands}} = this.props
        const facts = this.referenceFacts()
        const groups = facts.scope.map(({imageId, name}) => {
            const image = [...images, ...calculations].find(image => image.imageId === imageId)
            return {
                key: imageId, label: name, selected: [],
                options: (image.includedBands || []).map(band => ({
                    value: this.bandKey({...band, imageId}),
                    label: band.name,
                    band: {...band, imageId, imageName: name}
                }))
            }
        })
        for (const band of usedBands.value || []) {
            let group = groups.find(group => group.key === band.imageId)
            if (!group) {
                group = {key: band.imageId, label: band.imageName, options: [], selected: []}
                groups.push(group)
            }
            const {diagnostic} = CALCULATION_REFERENCES.evaluate({...facts, usedBands: [band]})
            group.selected.push({
                value: this.bandKey(band), label: band.name,
                problems: diagnostic?.problems.map(describeProblem) || []
            })
        }
        return groups
    }

    componentDidMount() {
        this.componentDidUpdate()
    }

    componentDidUpdate() {
        const {inputs: {reducer, defaultBandName, usedBands}} = this.props
        if (defaultBandName.value !== reducer.value) {
            defaultBandName.set(reducer.value)
        }
        const {diagnostic} = CALCULATION_REFERENCES.evaluate(this.referenceFacts())
        const error = diagnostic?.problems.map(describeProblem).join('\n') || ''
        // Standard external field feedback also blocks every form submission path. Keep the field's
        // existing notEmpty check; clearing a reference error must not make an empty function valid.
        if ((error || this.referenceError) && usedBands.error !== error) {
            usedBands.setInvalid(error)
        }
        this.referenceError = error
    }

    componentWillUnmount() {
        // The same form field is also used by the expression section, which supplies its own draft feedback.
        if (this.referenceError) this.props.inputs.usedBands.setInvalid('')
    }

    addBands(options) {
        const {inputs: {usedBands}} = this.props
        const selected = usedBands.value || []
        this.updateUsedBands([
            ...selected,
            ...options.filter(({value}) => !selected.some(band => this.bandKey(band) === value)).map(({band}) => band)
        ])
    }

    removeBand(value) {
        const {inputs: {usedBands}} = this.props
        this.updateUsedBands(usedBands.value.filter(band => this.bandKey(band) !== value))
    }

    removeGroupBands(group) {
        const {inputs: {usedBands}} = this.props
        this.updateUsedBands(usedBands.value.filter(band => band.imageId !== group.key))
    }

    updateUsedBands(bands) {
        const {inputs: {usedBands}} = this.props
        // Selection changes have always followed configured input/calculation band order, which matters for
        // first/last. Sort the retained objects instead of rebuilding them from choices, keeping their metadata.
        // Missing references follow available ones in their existing relative order; opening does not reorder.
        const available = this.referenceFacts().scope.flatMap(({imageId, bands}) =>
            bands.map(name => this.bandKey({imageId, name})))
        const order = new Map(available.map((key, index) => [key, index]))
        const position = band => order.get(this.bandKey(band)) ?? available.length
        usedBands.set([...bands].sort((a, b) => position(a) - position(b)))
    }

    bandKey({imageId, name}) {
        return JSON.stringify([imageId, name])
    }

}

export const FunctionSection = compose(
    _FunctionSection,
    withRecipe(mapRecipeToProps)
)

FunctionSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
