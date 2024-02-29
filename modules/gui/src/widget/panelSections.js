import {ButtonSelect} from 'widget/buttonSelect'
import {Form} from './form/form'
import {Panel} from 'widget/panel/panel'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

export class PanelSections extends React.Component {
    render() {
        const {icon, step} = this.props
        const section = this.findSection()
        const component = section.steps && step
            ? section.steps[step.value]
            : section.component
        return (
            <React.Fragment>
                <Panel.Header icon={icon} title={this.renderSelect()}/>
                {component
                    ? <Panel.Content>
                        {component}
                    </Panel.Content>
                    : null
                }
                {this.renderButtons()}
            </React.Fragment>
        )
    }

    renderSelect() {
        const {sections, selected, label, step} = this.props
        const options = _.chain(sections)
            .filter(section => section.value)
            .map(section => ({
                ...section,
                buttonLabel: section.title
            }))
            .value()
        return (
            <ButtonSelect
                chromeless
                shape='none'
                // placement='below'G
                input={selected}
                tooltipPlacement='bottom'
                options={options}
                label={label}
                onSelect={() => step && step.set(0)}
            />
        )
    }

    renderButtons() {
        const {step, defaultButtons} = this.props
        const section = this.findSection()
        if (!section.steps) {
            return section.buttons || defaultButtons
        } else {
            const last = this.isLastStep()
            const first = this.isFirstStep()
            return (
                <Form.PanelButtons
                    id={'panelSections'}
                    closable
                    wizard={['panelSections']}
                    first={first}
                    last={last}
                    onBack={() => step.set(step.value - 1)}
                    onNext={() => step.set(step.value + 1)}
                />
            )
        }
    }

    shouldComponentUpdate(nextProps) {
        return nextProps.inputs !== this.props.inputs
    }

    componentDidMount() {
        const {step, inputs, selected, onChange} = this.props
        step && step.set(0)
        if (this.isSelectionSection())
            Object.keys(inputs)
                .filter(name => name !== selected.name)
                .forEach(name => inputs[name] && inputs[name].set(''))

        onChange && selected.onChange(onChange)
    }

    isSelectionSection() {
        return !this.findSection().value
    }

    findSection() {
        const {sections, selected} = this.props
        return sections.find(({value}) => selected.value === value) || sections.find(({value}) => !value)
    }

    isFirstStep() {
        const {step} = this.props
        return step && step.value === 0
    }

    isLastStep() {
        const {step} = this.props
        const section = this.findSection()
        return step && section.steps && step.value === section.steps.length - 1
    }
}

PanelSections.propTypes = {
    inputs: PropTypes.any.isRequired,
    sections: PropTypes.array.isRequired,
    selected: PropTypes.any.isRequired, // input field
    defaultButtons: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    step: PropTypes.any, // input field
    onChange: PropTypes.func
}

PanelSections.defaultProps = {
    defaultButtons: <Form.PanelButtons/>
}
