import React from 'react'
import styles from './sections.module.css'
import {IconButton} from 'widget/button'
import Tooltip from 'widget/tooltip'

const Sections = () =>
    <div className={styles.sections}>
        <Section name='home' icon='home'/>
        <Section name='search' icon='globe'/>
        <Section name='browse' icon='folder-open'/>
        <Section name='process' icon='wrench'/>
        <Section name='terminal' icon='terminal'/>
    </div>
export default Sections

const Section = ({name, icon}) =>
    <Tooltip msg={'home.sections.' + name} right>
        <IconButton
            icon={icon}
            className={`${styles.section} ${styles[name + 'Icon']}`}/>
    </Tooltip>
