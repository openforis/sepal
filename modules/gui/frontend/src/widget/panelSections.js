import * as PropTypes from 'prop-types'
import React from 'react'
import {AnimateReplacement} from 'widget/animate'
import {Button} from 'widget/button'
import Icon from 'widget/icon'
import {PanelContent, PanelHeader} from 'widget/panel'
import styles from './panelSections.module.css'

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
    sections: PropTypes.any.isRequired,
    selected: PropTypes.any.isRequired
}

class Section extends React.Component {
    renderSectionIcon(section) {
        const {selected} = this.props
        return section.value
            ? <Button
                chromeless
                shape='none'
                icon='arrow-left'
                additionalClassName={styles.backButton}
                onClick={() => selected.set('')}/>
            : <Icon name={section.icon}/>
    }

    render() {
        const section = this.findSection()
        return (
            <div className={section.value ? styles.right : styles.left}>
                <PanelHeader>
                    <span className={styles.header}>
                        {this.renderSectionIcon(section)}
                        <span className={styles.title}>{section.title}</span>
                    </span>
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
                .forEach(name => {
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
    inputs: PropTypes.any,
    section: PropTypes.any,
    onBack: PropTypes.any
}
