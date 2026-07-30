import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Legend} from '~/widget/legend/legend'
import {ListItem} from '~/widget/listItem'

import styles from './constraint.module.css'
import {isValidPropertyEqualityValue, propertyEqualityValue} from './propertyEquality'

const fields = {
    image: new Form.Field()
        .notBlank(),
    band: new Form.Field()
        .skip((_value, {property}) => property)
        .notBlank(),
    property: new Form.Field()
        .skip((_value, {band}) => band)
        .notBlank(),
    bit: new Form.Field(),
    fromBit: new Form.Field()
        .skip((_value, {bit}) => !bit || !bit.length)
        .number()
        .notBlank(),
    toBit: new Form.Field()
        .skip((_value, {bit, fromBit}) => !bit || !bit.length || _.isNil(fromBit))
        .number()
        .notBlank(),
    fromBitInclusive: new Form.Field(),
    toBitInclusive: new Form.Field(),
    operator: new Form.Field()
        .notBlank(),
    value: new Form.Field()
        .skip((_value, {operator}) => !['<', '≤', '>', '≥', '='].includes(operator))
        .notBlank()
        // Property equality against a KNOWN-numeric property must be a finite number, so malformed text can't
        // persist as NaN. `propertyType` is a transient UI field (see syncPropertyType); it is only 'number'
        // for a property-equality constraint on a typed numeric property, so every other case is unaffected.
        .predicate(
            (value, {operator, propertyType}) => isValidPropertyEqualityValue(operator, propertyType, value),
            'fieldValidation.number'
        ),
    from: new Form.Field()
        .skip((_value, {operator}) => operator !== 'range')
        .number()
        .notBlank(),
    to: new Form.Field()
        .skip((_value, {operator, from}) => operator !== 'range' || _.isNil(from))
        .number()
        .notBlank(),
    fromInclusive: new Form.Field(),
    toInclusive: new Form.Field(),
    selectedClasses: new Form.Field(),
    // Transient UI-only field: the type of the currently selected property ('number'/'string'/'unknown'),
    // derived from the images schema (see syncPropertyType). Drives type-aware equality validation and
    // conversion. Never written into the persisted constraint.
    propertyType: new Form.Field()
}

class _Constraint extends React.Component {
    state = {
        invalid: false,
        constraint: undefined,
        imageSpec: undefined
    }

    operatorOptions = [
        {value: '<', label: msg('widget.imageConstraints.operator.lessThan.label')},
        {value: '≤', label: msg('widget.imageConstraints.operator.lessThanOrEquals.label')},
        {value: '>', label: msg('widget.imageConstraints.operator.greaterThan.label')},
        {value: '≥', label: msg('widget.imageConstraints.operator.greaterThanOrEquals.label')},
        {value: '=', label: msg('widget.imageConstraints.operator.equals.label')},
        {value: 'range', label: msg('widget.imageConstraints.operator.range.label')},
    ]

    categoricalOperatorOption = {
        value: 'class',
        label: msg('widget.imageConstraints.operator.oneOf.label')
    }

    render() {
        const {selected, onClick, onRemove} = this.props
        const {imageSpec} = this.state
        return (
            <ListItem
                expanded={selected}
                expansion={this.renderExpansion()}
                expansionInteractive
                onClick={onClick}>
                <CrudItem
                    title={imageSpec ? imageSpec.description : msg('widget.imageConstraints.image.notSelected')}
                    description={selected ? null : this.toDescription()}
                    unsafeRemove
                    onRemove={() => onRemove()}>
                </CrudItem>
            </ListItem>
        )
    }

    renderExpansion() {
        const {images, inlineValue, inputs: {bit, operator}} = this.props
        if (inlineValue && !this.applyOnBand()) {
            return (
                <Layout className={styles.compactConstraint}>
                    {images.length !== 1 ? this.renderImage() : null}
                    <Layout type='horizontal-nowrap' spacing='compact' className={styles.comparison}>
                        {this.renderProperty()}
                        {this.renderOperator()}
                    </Layout>
                    {this.renderValue()}
                </Layout>
            )
        }
        return (
            <Layout>
                {images.length !== 1 ? this.renderImage() : null}
                <Layout type='horizontal'>
                    {this.applyOnBand() ? this.renderBand() : this.renderProperty()}
                    {operator.value !== 'class' ? this.renderOperator() : null}
                    {isSelected(bit) ? this.renderBitRange() : null}
                </Layout>
                {this.renderValue()}
            </Layout>
        )
    }

    renderImage() {
        const {images, inputs: {image, band, operator}} = this.props
        const imageOptions = images.map(({id, description, bands}) => ({value: id, label: description, bands}))
        return (
            <Form.Combo
                label={msg('widget.imageConstraints.image.label')}
                input={image}
                options={imageOptions}
                onChange={({bands = [], properties = []}) => {
                    const selectDefaultBand = bands.length === 1
                    band.set(selectDefaultBand
                        ? bands[0].name
                        : null)
                    if (selectDefaultBand) {
                        if (bands[0].type === 'categorical') {
                            operator !== 'class' && operator.set('class')
                        } else {
                            operator === 'class' && operator.set('<')
                        }
                    }

                    const selectDefaultProperty = properties.length === 1
                    band.set(selectDefaultProperty
                        ? properties[0].name
                        : null)
                }}
            />
        )
    }

    renderBand() {
        const {images, inputs: {image, band, bit, operator}} = this.props
        const bitButton = (
            <Form.Buttons
                key={'bit'}
                input={bit}
                look="transparent"
                shape="pill"
                air="less"
                size="x-small"
                options={[{
                    value: true,
                    label: msg('widget.imageConstraints.bit.label'),
                    tooltip: msg('widget.imageConstraints.bit.tooltip')
                }]}
                multiple
                tabIndex={-1}
            />
        )
        const bandOptions = image.value
            ? images
                .find(({id}) => id === image.value).bands
                .map(({name, type}) => ({value: name, label: name, type}))
            : []

        return (
            <Form.Combo
                label={msg('widget.imageConstraints.band.label')}
                input={band}
                options={bandOptions}
                className={styles.band}
                buttons={[bitButton]}
                onChange={({type}) => {
                    if (type === 'categorical') {
                        operator.set('class')
                    } else {
                        (!operator.value || operator.value === 'class') && operator.set('<')
                    }
                }}
            />
        )
    }

    renderProperty() {
        const {images, categoriesByProperty, inputs: {image, property, operator, selectedClasses}} = this.props
        const propertyOptions = image.value
            ? images
                .find(({id}) => id === image.value).properties
                .map(({name, type}) => ({value: name, label: name, type}))
            : []

        return (
            <Form.Combo
                label={msg('widget.imageConstraints.property.label')}
                input={property}
                options={propertyOptions}
                className={styles.band}
                onChange={categoriesByProperty
                    ? ({value}) => {
                        selectedClasses.set([])
                        if (this.categoricalOptions(value)) {
                            operator.set('class')
                        } else if (operator.value === 'class') {
                            operator.set('=')
                        }
                    }
                    : null}
            />
        )
    }

    renderOperator() {
        const {inputs: {operator}} = this.props
        return (
            <Form.Combo
                label={msg('widget.imageConstraints.operator.label')}
                input={operator}
                options={this.categoricalOptions()
                    ? [...this.operatorOptions, this.categoricalOperatorOption]
                    : this.operatorOptions}
                className={styles.operator}
            />
        )
    }

    renderBitRange() {
        const {inputs: {fromBit, toBit, fromBitInclusive, toBitInclusive}} = this.props
        const fromInclusiveButton = inclButton(fromBitInclusive)
        const toInclusiveButton = inclButton(toBitInclusive)
        return (
            <Layout type='horizontal' className={styles.range}>
                <Form.Input
                    label={msg('widget.imageConstraints.bitRange.from.label')}
                    input={fromBit}
                    autoFocus
                    className={styles.rangeInput}
                    buttons={[fromInclusiveButton]}
                />
                <Form.Input
                    label={msg('widget.imageConstraints.bitRange.to.label')}
                    input={toBit}
                    className={styles.rangeInput}
                    buttons={[toInclusiveButton]}
                />
            </Layout>
        )
    }

    renderValue() {
        const {inputs: {operator}} = this.props
        switch (operator.value) {
            case 'class': return this.renderClassSelector()
            case 'range': return this.renderRangeSelector()
            default: return this.renderSingleValueSelector()
        }
    }

    // Categorical options for a property, or null. Opt-in: callers provide categoriesByProperty; band
    // constraints continue to read their categories from the image specification.
    categoricalOptions(propertyName) {
        const {applyOn, categoriesByProperty, inputs: {property}} = this.props
        if (applyOn !== 'properties' || !categoriesByProperty) {
            return null
        }
        const options = categoriesByProperty[propertyName === undefined ? property.value : propertyName]
        return options && options.length ? options : null
    }

    renderClassSelector() {
        const {inputs: {selectedClasses}} = this.props
        const entries = this.categoryEntries()
        return (
            <Legend
                entries={entries}
                label={this.applyOnBand() ? null : msg('widget.imageConstraints.value.label')}
                selected={selectedClasses.value}
                onSelectionChange={updatedSelection => selectedClasses.set([...updatedSelection])}
            />
        )
    }

    categoryEntries() {
        const {inputs: {band}} = this.props
        const {imageSpec} = this.state
        if (!this.applyOnBand()) {
            return this.categoricalOptions() || []
        }
        if (!imageSpec) {
            return []
        }
        const {legendEntries = []} = imageSpec.bands.find(({name}) => name === band.value) || {}
        return legendEntries
    }

    renderRangeSelector() {
        const {inputs: {from, to, fromInclusive, toInclusive}} = this.props
        const fromInclusiveButton = inclButton(fromInclusive)
        const toInclusiveButton = inclButton(toInclusive)
        return (
            <Layout type='horizontal' className={styles.range}>
                <Form.Input
                    label={msg('widget.imageConstraints.range.from.label')}
                    input={from}
                    autoFocus
                    className={styles.rangeInput}
                    buttons={[fromInclusiveButton]}
                />
                <Form.Input
                    label={msg('widget.imageConstraints.range.to.label')}
                    input={to}
                    className={styles.rangeInput}
                    buttons={[toInclusiveButton]}
                />
            </Layout>
        )
    }

    renderSingleValueSelector() {
        const {inputs: {value}} = this.props
        return (
            <Form.Input
                label={msg('widget.imageConstraints.value.label')}
                input={value}
                autoFocus
                className={styles.singleValueInput}
            />
        )
    }

    componentDidMount() {
        const {inputs: {
            image, band, property, bit, operator,
            fromBit, fromBitInclusive, toBit, toBitInclusive,
            from, fromInclusive, to, toInclusive,
            value, selectedClasses}
        } = this.props
        const toBooleanButton = (field, defaultValue) => _.isNil(constraint[field])
            ? defaultValue ? [true] : []
            : constraint[field] ? [constraint[field]] : []
            
        const {constraint} = this.props
        image.set(constraint.image)
        band.set(constraint.band)
        property.set(constraint.property)
        bit.set(toBooleanButton('bit', false))
        operator.set(constraint.operator || this.operatorOptions[0].value)
        fromBit.set(constraint.fromBit)
        fromBitInclusive.set(toBooleanButton('fromBitInclusive', true))
        toBit.set(constraint.toBit)
        toBitInclusive.set(toBooleanButton('toBitInclusive', true))
        from.set(constraint.from)
        fromInclusive.set(toBooleanButton('fromInclusive', true))
        to.set(constraint.to)
        toInclusive.set(toBooleanButton('toInclusive', false))
        value.set(constraint.value)
        selectedClasses.set(constraint.selectedClasses || [])
        const scheduledTypeChange = this.syncPropertyType()
        this.putImageSpecInState()
        // If the property type is still settling, defer the first publish to the follow-up update, so the
        // initial constraint is never published with a stale type.
        if (!scheduledTypeChange) {
            this.updateConstraint()
        }
    }

    componentDidUpdate() {
        // propertyType.set() applies on the next render, so publishing now would use the previous type and
        // could transiently emit a wrongly typed constraint when the property changes. Defer the rest of the
        // cycle until the new type is applied.
        if (this.syncPropertyType()) {
            return
        }
        this.validate()
        this.updateConstraint()
        this.putImageSpecInState()
    }

    // Mirror the selected property's schema type into the transient `propertyType` field, so equality
    // validation/conversion react to it - and so switching property (numeric<->string) immediately clears
    // stale validation and revalidates the current value. Returns true when it SCHEDULES a type change (the
    // value applies on the next render), so the caller can defer publishing until the type has settled. Only
    // meaningful for the properties path; guarded so a stable type does not loop. The Feature Layer path types
    // columns as 'unknown', preserving raw strings.
    syncPropertyType() {
        const {applyOn, inputs: {property, propertyType}} = this.props
        if (applyOn !== 'properties') {
            return false
        }
        const type = this.propertyTypeOf(property.value)
        if (propertyType.value !== type) {
            propertyType.set(type)
            return true
        }
        return false
    }

    propertyTypeOf(name) {
        const {images, inputs: {image}} = this.props
        const spec = images.find(({id}) => id === image.value)
        const property = spec && (spec.properties || []).find(({name: propertyName}) => propertyName === name)
        return property ? property.type : undefined
    }

    applyOnBand() {
        const {applyOn} = this.props
        return applyOn === 'bands'
    }

    putImageSpecInState() {
        const {images, inputs: {image}} = this.props
        const imageSpec = images.find(({id}) => id === image.value)
        this.setState(({imageSpec: prevSpec}) => _.isEqual(prevSpec, imageSpec) ? null : {imageSpec})
    }

    validate() {
        const {form, onValidate} = this.props
        this.setState(({invalid}) => {
            const becameInvalid = form.isInvalid()
            if (invalid === becameInvalid) {
                return null
            } else {
                onValidate && onValidate(becameInvalid)
                return {invalid: becameInvalid}
            }
        })
    }

    toDescription() {
        const {applyOn, inputs: {band, property, bit, fromBit, fromBitInclusive, toBit, toBitInclusive, operator, from, fromInclusive, to, toInclusive}} = this.props
        const applyOnBand = applyOn === 'bands'
        if (applyOnBand && !band.value) {
            return msg('widget.imageConstraints.band.notSelected')
        } else if (!applyOnBand && !property.value) {
            return msg('widget.imageConstraints.property.notSelected')
        }
        const format = input => _.isFinite(parseFloat(input.value)) ? input.value : '?'
        const source = applyOnBand ? band.value : property.value
        const formattedSource = isSelected(bit)
            ? `${source}${isSelected(fromBitInclusive) ? '[' : '('}${fromBit.value}, ${toBit.value}${isSelected(toBitInclusive) ? ']' : ')'}`
            : source
        switch (operator.value) {
            case 'class': return this.toSelectedClassesDescription()
            case 'range': return `${format(from)} ${isSelected(fromInclusive) ? '≤' : '<'} ${formattedSource} ${isSelected(toInclusive) ? '≤' : '<'} ${format(to)}`
            default: return `${formattedSource} ${operator.value} ${this.extractValue()}`
        }
    }

    toSelectedClassesDescription() {
        const {inputs: {selectedClasses}} = this.props
        return this.categoryEntries()
            .filter(({value}) => selectedClasses.value.includes(value))
            .map(({value, label}) => this.applyOnBand() ? label : label || value).join(', ') || 'no selection'
    }

    toConstraint() {
        const {
            constraint: {id},
            inputs: {
                image, band, property,
                bit, fromBit, toBit, fromBitInclusive, toBitInclusive,
                operator, from, fromInclusive, to, toInclusive, selectedClasses
            }
        } = this.props
        
        const toBoolean = input => !!(input.value && input.value.length && input.value[0])

        const constraint = {
            id,
            description: this.toDescription(),
            image: image.value,
            band: band.value,
            property: property.value,
            bit: toBoolean(bit),
            fromBit: toInt(fromBit.value),
            toBit: toInt(toBit.value),
            fromBitInclusive: toBoolean(fromBitInclusive),
            toBitInclusive: toBoolean(toBitInclusive),
            operator: operator.value
        }
        
        switch(operator.value) {
            case 'class': return {
                ...constraint,
                selectedClasses: selectedClasses.value
            }
            case 'range': return {
                ...constraint,
                from: parseFloat(from.value),
                fromInclusive: toBoolean(fromInclusive),
                to: parseFloat(to.value),
                toInclusive: toBoolean(toInclusive)
            }
            default: return {
                ...constraint,
                value: this.extractValue()
            }
        }
    }

    extractValue() {
        const {applyOn, inputs: {operator, value, propertyType}} = this.props
        // Property equality is type-aware: a known-numeric property persists a number (so "08" -> 8), a known
        // string stays a string ("08" -> "08"), and an unknown type keeps the raw string (backward-compatible,
        // and the categorical Feature Layer path where the raw value is already the exact category value).
        return applyOn === 'properties' && operator.value === '='
            ? propertyEqualityValue(propertyType.value, value.value)
            : parseFloat(value.value)
    }

    updateConstraint() {
        const {form, onChange} = this.props
        if (form.isInvalid()) return

        const constraint = this.toConstraint()
        this.setState(({constraint: prevConstraint}) => {
            if (_.isEqual(prevConstraint, constraint)) {
                return null
            } else {
                onChange && onChange(constraint)
                return {constraint}
            }
        })
    }
}

const inclButton = input =>
    <Form.Buttons
        key={'incl'}
        input={input}
        look="transparent"
        shape="pill"
        air="less"
        size="x-small"
        options={[{
            value: true,
            label: msg('widget.imageConstraints.inclusive.label'),
            tooltip: msg('widget.imageConstraints.inclusive.tooltip')
        }]}
        multiple
        tabIndex={-1}
    />
    
const toInt = input => {
    input = _.isString(input) ? input : _.toString(input)
    const parsed = parseInt(input)
    return _.isFinite(parsed) ? parsed : null
}

const isSelected = input => input.value && input.value.length && input.value[0]

export const Constraint = compose(
    _Constraint,
    withForm({fields})
)
