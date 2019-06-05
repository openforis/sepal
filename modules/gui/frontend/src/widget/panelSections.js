import * as PropTypes from 'prop-types'
import {FieldSet} from 'widget/form'
import {PanelContent, PanelHeader} from 'widget/panel'
import ButtonSelect from 'widget/buttonSelect'
import Icon from 'widget/icon'
import React from 'react'
import _ from 'lodash'
import styles from './panelSections.module.css'

export default class PanelSections extends React.Component {
    render() {
        const {icon} = this.props
        const section = this.findSection()
        return (
            <div className={styles.sections}>
                <PanelHeader>
                    <div className={styles.header}>
                        <Icon name={icon}/>
                        {this.renderSelect()}
                    </div>
                </PanelHeader>
                <PanelContent>
                    <FieldSet>
                        {section && section.component}
                    </FieldSet>
                </PanelContent>
            </div>
        )
    }

    renderSelect() {
        const {sections, selected, label} = this.props
        const options = _.chain(sections)
            .filter(section => section.value)
            .map(section => ({
                ...section,
                buttonLabel: section.title,
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

    shouldComponentUpdate(nextProps) {
        return nextProps.inputs !== this.props.inputs
    }

    componentDidMount() {
        const {inputs, selected} = this.props
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
}

PanelSections.propTypes = {
    selected: PropTypes.any.isRequired,
    icon: PropTypes.string,
    inputs: PropTypes.any,
    label: PropTypes.string,
    section: PropTypes.any
}
