import {Buttons} from '../buttons'
import {Constraint} from './constraint'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from '../../translate'
import {withMapContext} from 'app/home/map/mapContext'
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
                <Panel.Buttons onEscape={deactivate} onEnter={() => invalid || this.apply()}>
                    <Panel.Buttons.Add
                        disabled={invalid}
                        onClick={() => this.addConstraint()}
                    />
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel onClick={deactivate}/>
                        <Panel.Buttons.Apply
                            disabled={invalid}
                            onClick={() => this.apply()}
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
        const {constraints = []} = this.props
        this.setState({constraints})
        if (constraints.length) {
            this.setState({constraints})
        } else {
            this.addConstraint()
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
        const image = images.length ? images[0].id : null
        const band = image && images[0].bands.length ? images[0].bands[0].name : null
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
        const {images} = this.props
        const {constraints, selected} = this.state
        return (
            <div>
                {constraints.map(constraint =>
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
                )}
            </div>
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
    withMapContext(),
    activatable({
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
    icon: PropTypes.string,
}
