import * as PropTypes from 'prop-types'
import React from 'react'
import {AnimateReplacement} from 'widget/animate'
import Icon from 'widget/icon'
import {PanelContent, PanelHeader} from 'widget/panel'
import styles from 'widget/panelSections.module.css'

export default class PanelSections extends React.Component {
    render() {
        const {selected, sections} = this.props
        return <div className={styles.sections}>
            <AnimateReplacement
                currentKey={selected.value}
                timeout={250}
                classNames={{enter: styles.enter, exit: styles.exit}}>
                <Section
                    section={
                        sections.find(({value}) => selected.value === value)
                        || sections.find(({value}) => !value)}
                    onBack={() => selected.set('')}/>
            </AnimateReplacement>
        </div>
    }
}

const Section = ({section, onBack}) =>
    <div className={section.value ? styles.right : styles.left}>
        <PanelHeader>
            {section.value
                ? <a
                    onClick={() => onBack()}
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

PanelSections.propTypes = {
    selected: PropTypes.any,
    sections: PropTypes.any
}
