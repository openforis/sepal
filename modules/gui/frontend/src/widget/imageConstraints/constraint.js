import {Form, form} from '../form/form'
import {Layout} from '../layout'
import {SuperButton} from '../superButton'
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
    toInclusive: new Form.Field()
}

class _Constraint extends React.Component {
    state = {
        invalid: false,
        constraint: undefined
    }

    operatorOptions = [
        {value: '<', label: '<'},
        {value: '≤', label: '≤'},
        {value: '>', label: '>'},
        {value: '≥', label: '≥'},
        {value: '=', label: '='},
        {value: 'range', label: 'range'},
    ]

    render() {
        const {selected, images, inputs: {image, operator}, onClick, onRemove} = this.props
        return (
            <SuperButton
                title={image.value}
                description={this.toDescription()}
                expanded={selected}
                unsafeRemove
                expandedClassName={styles.constraintForm}
                onClick={() => onClick()}
                onRemove={() => onRemove()}>
                <Layout>
                    {images.length !== 1 ? this.renderImage() : null}
                    <Layout type='horizontal'>
                        {this.renderBand()}
                        {operator.value !== 'class' ? this.renderOperator() : null}
                        {this.renderValue()}
                    </Layout>
                </Layout>
            </SuperButton>
        )
    }

    renderImage() {
        const {images, inputs: {image, band}} = this.props
        const imageOptions = images.map(({id, description, bands}) => ({value: id, label: description, bands}))
        return (
            <Form.Combo
                label={'Image'}
                input={image}
                options={imageOptions}
                onChange={({bands}) => bands.length === 1 && band.set(bands[0].name)}
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
                label={'Band'}
                input={band}
                options={bandOptions}
                className={styles.band}
                onChange={({type}) => type === 'categorical' && operator.set('class')}
            />
        )
    }

    renderOperator() {
        const {inputs: {operator}} = this.props
        return (
            <Form.Combo
                label={'Operator'}
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
        return null // TODO: Implement...
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
                    label={'From value'}
                    input={from}
                    autoFocus
                    errorMessage
                    className={styles.rangeInput}
                    additionalButtons={[fromInclusiveButton]}
                />
                <Form.Input
                    label={'To value'}
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
                label={'Value'}
                input={value}
                autoFocus
                errorMessage
                className={styles.singleValueInput}
            />
        )
    }

    componentDidMount() {
        const {inputs: {image, band, operator, from, fromInclusive, to, toInclusive, value}} = this.props
        const {constraint} = this.props
        image.set(constraint.image)
        band.set(constraint.band && constraint.band)
        operator.set(constraint.operator || this.operatorOptions[0].value)
        from.set(constraint.from)
        fromInclusive.set(constraint.fromInclusive ? [constraint.fromInclusive] : [])
        to.set(constraint.to)
        toInclusive.set(constraint.toInclusive ? [constraint.toInclusive] : [])
        value.set(constraint.value)
        this.updateConstraint()
    }

    componentDidUpdate() {
        this.validate()
        this.updateConstraint()
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
        const format = input => _.isFinite(parseFloat(input.value)) ? input.value : '?'
        const isInclusive = input => input.value && input.value.length && input.value[0]
        switch (operator.value) {
        case 'class': return null // TODO: Implement...
        case 'range': return `${format(from)} ${isInclusive(fromInclusive) ? '≤' : '<'} ${band.value} ${isInclusive(toInclusive) ? '≤' : '<'} ${format(to)}`
        default: return `${band.value} ${operator.value} ${format(value)}`
        }
    }

    toConstraint() {
        const {constraint: {id}, inputs: {image, band, operator, from, fromInclusive, to, toInclusive, value}} = this.props
        const constraint = {
            id,
            description: this.toDescription(),
            image: image.value,
            band: band.value,
            operator: operator.value
        }

        switch(operator.value) {
        case 'class': return constraint // TODO: Implement...
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
    form({fields})
)
