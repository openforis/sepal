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
        .notBlank(),
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
    selectedClasses: new Form.Field()
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

    render() {
        const {selected, images, inputs: {bit, operator}, onClick, onRemove} = this.props
        const {imageSpec} = this.state
        return (
            <ListItem
                expanded={selected}
                expansion={
                    <Layout>
                        {images.length !== 1 ? this.renderImage() : null}
                        <Layout type='horizontal'>
                            {this.applyOnBand() ? this.renderBand() : this.renderProperty()}
                            {operator.value !== 'class' ? this.renderOperator() : null}
                            {isSelected(bit) ? this.renderBitRange() : null}
                        </Layout>
                        {this.renderValue()}
                    </Layout>
                }
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
        const {images, inputs: {image, property}} = this.props
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
            />
        )
    }

    renderOperator() {
        const {inputs: {operator}} = this.props
        return (
            <Form.Combo
                label={msg('widget.imageConstraints.operator.label')}
                input={operator}
                options={this.operatorOptions}
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

    renderClassSelector() {
        const {inputs: {band, selectedClasses}} = this.props
        const {imageSpec} = this.state
        if (!imageSpec) {
            return null
        }
        const {legendEntries = []} = imageSpec.bands.find(({name}) => name === band.value) || {}
        return (
            <Legend
                entries={legendEntries}
                selected={selectedClasses.value}
                onSelectionChange={updatedSelection => selectedClasses.set([...updatedSelection])}
            />
        )
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
        this.updateConstraint()
        this.putImageSpecInState()
    }

    componentDidUpdate() {
        this.validate()
        this.updateConstraint()
        this.putImageSpecInState()
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
        const {inputs: {band, selectedClasses}} = this.props
        const {imageSpec} = this.state
        if (!imageSpec) {
            return null
        }
        const {legendEntries = []} = imageSpec.bands.find(({name}) => name === band.value) || {}
        return legendEntries
            .filter(({value}) => selectedClasses.value.includes(value))
            .map(({label}) => label).join(', ') || 'no selection'
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
        const {applyOn, inputs: {operator, value}} = this.props
        return applyOn === 'properties' && operator.value === '='
            ? value.value
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

