import {CrudItem} from 'widget/crudItem'
import {Form, withForm} from '../form/form'
import {Layout} from '../layout'
import {Legend} from '../legend/legend'
import {ListItem} from 'widget/listItem'
import {compose} from '../../compose'
import {msg} from '../../translate'
import React from 'react'
import _ from 'lodash'
import styles from './constraint.module.css'

const fields = {
    image: new Form.Field()
        .notBlank(),
    band: new Form.Field()
        .notBlank(),
    operator: new Form.Field()
        .notBlank(),
    value: new Form.Field()
        .skip((value, {operator}) => !['<', '≤', '>', '≥', '='].includes(operator))
        .number()
        .notBlank(),
    from: new Form.Field()
        .skip((value, {operator}) => operator !== 'range')
        .number()
        .notBlank(),
    to: new Form.Field()
        .number()
        .skip((value, {operator}) => operator !== 'range')
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
        const {selected, images, inputs: {operator}, onClick, onRemove} = this.props
        const {imageSpec} = this.state
        return (
            <ListItem
                expanded={selected}
                expansion={
                    <Layout>
                        {images.length !== 1 ? this.renderImage() : null}
                        <Layout type='horizontal'>
                            {this.renderBand()}
                            {operator.value !== 'class' ? this.renderOperator() : null}
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
                onChange={({bands}) => {
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

                }}
            />
        )
    }

    renderBand() {
        const {images, inputs: {image, band, operator}} = this.props
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
        const inclButton = input =>
            <Form.Buttons
                key={'incl'}
                input={input}
                look="transparent"
                shape="pill"
                air="less"
                size="x-small"
                options={[{value: true, label: 'incl', tooltip: msg('map.visParams.form.band.reverse.tooltip')}]}
                multiple
                tabIndex={-1}
            />

        const fromInclusiveButton = inclButton(fromInclusive)
        const toInclusiveButton = inclButton(toInclusive)
        return (
            <Layout type='horizontal' className={styles.range}>
                <Form.Input
                    label={msg('widget.imageConstraints.range.from.label')}
                    input={from}
                    autoFocus
                    errorMessage
                    className={styles.rangeInput}
                    additionalButtons={[fromInclusiveButton]}
                />
                <Form.Input
                    label={msg('widget.imageConstraints.range.to.label')}
                    input={to}
                    errorMessage
                    className={styles.rangeInput}
                    additionalButtons={[toInclusiveButton]}
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
                errorMessage
                className={styles.singleValueInput}
            />
        )
    }

    componentDidMount() {
        const {inputs: {image, band, operator, from, fromInclusive, to, toInclusive, value, selectedClasses}} = this.props
        const {constraint} = this.props
        image.set(constraint.image)
        band.set(constraint.band && constraint.band)
        operator.set(constraint.operator || this.operatorOptions[0].value)
        from.set(constraint.from)
        fromInclusive.set(constraint.fromInclusive ? [constraint.fromInclusive] : [])
        to.set(constraint.to)
        toInclusive.set(constraint.toInclusive ? [constraint.toInclusive] : [])
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
        const {inputs: {band, operator, from, fromInclusive, to, toInclusive, value}} = this.props
        if (!band.value) {
            return msg('widget.imageConstraints.band.notSelected')
        }
        const format = input => _.isFinite(parseFloat(input.value)) ? input.value : '?'
        const isInclusive = input => input.value && input.value.length && input.value[0]
        switch (operator.value) {
        case 'class': return this.toSelectedClassesDescription()
        case 'range': return `${format(from)} ${isInclusive(fromInclusive) ? '≤' : '<'} ${band.value} ${isInclusive(toInclusive) ? '≤' : '<'} ${format(to)}`
        default: return `${band.value} ${operator.value} ${format(value)}`
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
        const {constraint: {id}, inputs: {image, band, operator, from, fromInclusive, to, toInclusive, value, selectedClasses}} = this.props
        const constraint = {
            id,
            description: this.toDescription(),
            image: image.value,
            band: band.value,
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
            fromInclusive: !!(fromInclusive.value && fromInclusive.value.length && fromInclusive.value[0]),
            to: parseFloat(to.value),
            toInclusive: !!(toInclusive.value && toInclusive.value.length && toInclusive.value[0]),
        }
        default: return {
            ...constraint,
            value: parseFloat(value.value)
        }
        }
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

export const Constraint = compose(
    _Constraint,
    withForm({fields})
)

