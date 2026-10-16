import _ from 'lodash'
import memoizeOne from 'memoize-one'
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

const getBooleanOperatorsOptions = memoizeOne(() => [
    {value: 'and', label: msg('widget.imageConstraints.booleanOperator.and')},
    {value: 'or', label: msg('widget.imageConstraints.booleanOperator.or')}
])

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
                    placement='modal'
                    onBackdropClick={this.close}>
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
                options={getBooleanOperatorsOptions()}
                onChange={booleanOperator => this.changeBooleanOperator(booleanOperator)}
            />
        )
    }

    componentDidMount() {
        const {constraintsId, booleanOperator, constraints = [], createCandidate} = this.props
        this.mounted = true
        this.candidate = createCandidate?.(() => this.mounted && this.forceUpdate())
        if (constraints.length) {
            this.setState({constraints})
        } else {
            this.addConstraint()
        }
        this.setState({constraintsId, booleanOperator})
    }

    componentDidUpdate() {
        // An optional existing output candidate reads only this modal's draft, sharing source observations while
        // keeping its findings separate from the applied recipe. Other constraint-editor callers do not create one.
        this.candidate?.update(this.state.constraints)
    }

    componentWillUnmount() {
        this.mounted = false
        this.candidate?.stop()
    }

    candidateErrors() {
        return this.candidate
            ? this.props.candidateErrors(this.candidate.diagnostics(), this.state.constraints)
            : {}
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
        return !!Object.values(invalidById).find(invalid => invalid) || Object.keys(this.candidateErrors()).length > 0
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
            <Layout type='vertical' spacing='tight' shrink>
                {constraints.map(constraint => this.renderConstraint(constraint))}
            </Layout>
        )
    }

    renderConstraint(constraint) {
        const {images, applyOn, checkReferences} = this.props
        const {selected} = this.state
        return (
            <Constraint
                key={constraint.id}
                constraint={constraint}
                images={images}
                selected={selected === constraint.id}
                applyOn={applyOn}
                checkReferences={checkReferences}
                sourceError={this.candidateErrors()[constraint.id]}
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

    // An invalid constraint keeps the focus, but any other invalid one can take it: several found invalid when opened can
    // each be repaired.
    select(constraintId) {
        const {selected, invalidById} = this.state
        const selectable = !this.isInvalid() || ((invalidById[constraintId] || this.candidateErrors()[constraintId]) && constraintId !== selected)
        selectable && this.setState(({selected}) => ({
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
    // Whether a constraint naming an image or band not among `images` is invalid.
    checkReferences: PropTypes.any,
    constraints: PropTypes.array,
    constraintsId: PropTypes.string,
    createCandidate: PropTypes.func,
    candidateErrors: PropTypes.func,
}
