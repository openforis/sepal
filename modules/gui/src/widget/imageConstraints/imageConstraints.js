import {Buttons} from '../buttons'
import {Constraint} from './constraint'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {msg} from '../../translate'
import {withActivatable} from 'widget/activation/activatable'
import PropTypes from 'prop-types'
import React from 'react'
import guid from 'guid'
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
    }

    render() {
        const {icon, title, activatable: {deactivate}} = this.props
        const invalid = this.isInvalid()
        return (
            <Panel type='modal' className={styles.panel}>
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
                            onClick={deactivate}
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
        const {booleanOperator, constraints = []} = this.props
        this.setState({constraints})
        if (constraints.length) {
            this.setState({constraints})
        } else {
            this.addConstraint()
        }
        if (booleanOperator) {
            this.setState({booleanOperator})
        }
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
        const id = guid()
        const image = images.length === 1 ? images[0].id : null
        const band = image && images[0].bands.length === 1 ? images[0].bands[0].name : null
        const operator = band && images[0].bands[0].type === 'categorical'
            ? 'class'
            : '<'
        const fromInclusive = true
        this.setState(({constraints}) => ({
            constraints: [...constraints, {id, image, band, operator, fromInclusive}],
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
        const {images} = this.props
        const {selected} = this.state
        return (
            <Constraint
                key={constraint.id}
                constraint={constraint}
                images={images}
                selected={selected === constraint.id}
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
        const {onChange, activatable: {deactivate}} = this.props
        const {constraints, booleanOperator} = this.state
        deactivate()
        onChange && onChange({constraints, booleanOperator})
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

ImageConstraints.propTypes = {
    id: PropTypes.string.isRequired,
    images: PropTypes.array.isRequired,
    title: PropTypes.any.isRequired,
    onChange: PropTypes.func.isRequired,
    booleanOperator: PropTypes.func,
    icon: PropTypes.string,
}
