import * as PropTypes from 'prop-types'
import React from 'react'
import {AnimateReplacement} from 'widget/animate'
import Icon from 'widget/icon'
import {PanelContent, PanelHeader} from 'widget/panel'
import styles from 'widget/panelSections.module.css'

export default class PanelSections extends React.Component {
    render() {
        const {inputs, selected, sections} = this.props
        return <div className={styles.sections}>
            <AnimateReplacement
                currentKey={selected.value}
                timeout={250}
                classNames={{enter: styles.enter, exit: styles.exit}}>
                <Section
                    inputs={inputs}
                    selected={selected}
                    sections={sections}/>
            </AnimateReplacement>
        </div>
    }
}

PanelSections.propTypes = {
    inputs: PropTypes.object.isRequired,
    selected: PropTypes.any.isRequired,
    sections: PropTypes.any.isRequired
}

class Section extends React.Component {
    render() {
        const {selected} = this.props
        const section = this.findSection()
        return (
            <div className={section.value ? styles.right : styles.left}>
                <PanelHeader>
                    {section.value
                        ? <a
                            onClick={() => selected.set('')}
                            onMouseDown={e => e.preventDefault()}>
                            <Icon name='arrow-left'/>
                        </a>
                        : <Icon name={section.icon}/>}
                    {section.title}
                </PanelHeader>
                <PanelContent>
                    {section.component}
                </PanelContent>
            </div>
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
                .forEach((name) => {
                    return inputs[name] && inputs[name].set('')
                })
    }

    isSelectionSection() {
        return !this.findSection().value
    }

    findSection() {
        const {sections, selected} = this.props
        return sections.find(({value}) => selected.value === value)
            || sections.find(({value}) => !value)
    }
}

Section.propTypes = {
    section: PropTypes.any,
    onBack: PropTypes.any,
    inputs: PropTypes.any
}
