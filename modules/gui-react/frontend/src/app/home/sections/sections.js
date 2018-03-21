import React from 'react'
import styles from './sections.module.css'
import {IconButton} from 'widget/button'
import Tooltip from 'widget/tooltip'
import {Link} from 'route'

const Sections = () =>
    <div className={styles.sectionsContainer}>
        <div className={styles.sections}>
            {/*<Section name='dashboard' icon='home'/>*/}
            <Section name='process' icon='globe'/>
            <Section name='browse' icon='folder-open'/>
            <Section name='modules' icon='wrench'/>
            <Section name='terminal' icon='terminal'/>
        </div>
    </div>
export default Sections

const Section = ({name, icon}) =>
    <Link to={'/' + name} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip msg={'home.sections.' + name} right>
            <IconButton
                icon={icon}
                className={`${styles.section} ${styles[name + 'Icon']}`}/>
        </Tooltip>
    </Link>
