import * as PropTypes from 'prop-types'
import {Panel} from 'widget/panel/panel'
import ButtonSelect from 'widget/buttonSelect'
import React from 'react'
import _ from 'lodash'
import {Form} from './form/form'

export default class PanelSections extends React.Component {
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
        const {sections, selected, label} = this.props
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
                placement='below'
                alignment='left'
                input={selected}
                tooltipPlacement='bottom'
                options={options}
                label={label}
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
        const {step, inputs, selected} = this.props
        step && step.set(0)
        if (this.isSelectionSection())
            Object.keys(inputs)
                .filter(name => name !== selected.name)
                .forEach(name => {
                    return inputs[name] && inputs[name].set('')
                })
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
    sections: PropTypes.array.isRequired,
    inputs: PropTypes.any.isRequired,
    selected: PropTypes.any.isRequired, // input field
    step: PropTypes.any, // input field
    icon: PropTypes.string,
    label: PropTypes.string,
    defaultButtons: PropTypes.any
}

PanelSections.defaultProps = {
    defaultButtons: <Form.PanelButtons/>
}
