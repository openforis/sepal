import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {msg} from '../../translate'
import {Buttons} from '../buttons'
import {Constraint} from './constraint'
import styles from './imageConstraints.module.css'

class _ImageConstraints extends React.Component {
    state = {
        constraints: [],
        booleanOperator: 'and',
        selected: undefined,
        invalidById: {}
    }

    constructor(props) {
        super(props)
        this.addConstraint = this.addConstraint.bind(this)
        this.apply = this.apply.bind(this)
        this.close = this.close.bind(this)
    }

    render() {
        const {icon, title} = this.props
        const {constraints} = this.state
        const invalid = this.isInvalid()
        return constraints
            ? (
                <Panel
                    className={styles.panel}
                    placement='modal'>
                    <Panel.Header
                        icon={icon}
                        title={title}
                        label={this.renderBooleanOperators()}
                    />
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Panel.Buttons>
                        <Panel.Buttons.Add
                            disabled={invalid}
                            onClick={this.addConstraint}
                        />
                        <Panel.Buttons.Main>
                            <Panel.Buttons.Cancel
                                keybinding='Escape'
                                onClick={this.close}
                            />
                            <Panel.Buttons.Apply
                                keybinding='Enter'
                                disabled={invalid}
                                onClick={this.apply}
                            />
                        </Panel.Buttons.Main>
                    </Panel.Buttons>
                </Panel>
            )
            : null
    }

    renderBooleanOperators() {
        const {booleanOperator} = this.state
        return (
            <Buttons
                selected={booleanOperator}
                alignment='right'
                options={[
                    {value: 'and', label: 'and', tooltip: msg('widget.imageConstraints.logicalAnd.tooltip')},
                    {value: 'or', label: 'or', tooltip: msg('widget.imageConstraints.logicalOr.tooltip')}
                ]}
                onChange={booleanOperator => this.changeBooleanOperator(booleanOperator)}
            />
        )
    }

    componentDidMount() {
        const {constraintsId, booleanOperator, constraints = []} = this.props
        if (constraints.length) {
            this.setState({constraints})
        } else {
            this.addConstraint()
        }
        this.setState({constraintsId, booleanOperator})
    }

    close() {
        const {activatable: {deactivate}} = this.props
        deactivate()
    }

    changeBooleanOperator(booleanOperator) {
        this.setState({booleanOperator})
    }

    isInvalid() {
        const {invalidById} = this.state
        return !!Object.values(invalidById).find(invalid => invalid)
    }

    addConstraint() {
        const {images = []} = this.props
        const id = uuid()
        const image = images.length === 1 ? images[0].id : null
        const band = image && images[0].bands?.length === 1 ? images[0].bands[0].name : null
        const property = image && images[0].properties?.length === 1 ? images[0].properties[0].name : null
        const fromBitInclusive = true
        const toBitInclusive = true
        const operator = band && images[0].bands[0].type === 'categorical'
            ? 'class'
            : '='
        const fromInclusive = true
        this.setState(({constraints}) => ({
            constraints: [
                ...constraints, {
                    id, image, band, property, fromBitInclusive, toBitInclusive, operator, fromInclusive
                }],
            selected: id
        }))
    }

    renderContent() {
        const {constraints} = this.state
        return (
            <Layout type='vertical' spacing='tight'>
                {constraints.map(constraint => this.renderConstraint(constraint))}
            </Layout>
        )
    }

    renderConstraint(constraint) {
        const {images, applyOn} = this.props
        const {selected} = this.state
        return (
            <Constraint
                key={constraint.id}
                constraint={constraint}
                images={images}
                selected={selected === constraint.id}
                applyOn={applyOn}
                onClick={() => this.select(constraint.id)}
                onRemove={() => this.remove(constraint.id)}
                onValidate={invalid => this.setState(({invalidById}) => ({
                    invalidById: {
                        ...invalidById,
                        [constraint.id]: invalid
                    }
                }))}
                onChange={constraint => this.updateConstraint(constraint)}
            />
        )
    }

    select(constraintId) {
        !this.isInvalid() && this.setState(({selected}) => ({
            selected: selected === constraintId ? null : constraintId
        }))
    }

    updateConstraint(constraint) {
        this.setState(({constraints}) => ({
            constraints: constraints.map(c =>
                c.id === constraint.id ? constraint : c
            )
        }))
    }

    remove(constraintId) {
        this.setState(({constraints, invalidById}) => {
            const updatedInvalid = {...invalidById}
            delete updatedInvalid[constraintId]
            return ({
                constraints: constraints.filter(({id}) => id !== constraintId),
                invalidById: updatedInvalid
            })
        })
    }

    apply() {
        const {constraintsId, onChange} = this.props
        const {constraints, booleanOperator} = this.state
        this.close()
        onChange && onChange({id: constraintsId, constraints, booleanOperator})
    }
}

const policy = () => ({
    _: 'allow'
})

export const ImageConstraints = compose(
    _ImageConstraints,
    withActivatable({
        id: ({id}) => id,
        policy,
        alwaysAllow: true
    })
)

export const renderConstraintsDescription = ({constraints, booleanOperator}) => {
    const toDescriptions = () => {
        const booleans = Array(constraints.length - 1).fill(booleanOperator)
        return _.zip(constraints, booleans)
            .map(([{id, description}, operator]) =>
                <div key={id}>{description} {operator}</div>
            )
    }
    const descriptions = constraints.length
        ? toDescriptions()
        : msg('process.asset.panel.mask.emptyConstraints')
    return (
        <div className={styles.constraintsDescriptions}>
            {descriptions}
        </div>
    )
}

ImageConstraints.propTypes = {
    id: PropTypes.string.isRequired,
    images: PropTypes.array.isRequired,
    title: PropTypes.any.isRequired,
    onChange: PropTypes.func.isRequired,
    applyOn: PropTypes.string,
    booleanOperator: PropTypes.any,
    constraints: PropTypes.array,
    constraintsId: PropTypes.string,
}
