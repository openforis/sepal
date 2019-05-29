import {Selectable} from 'widget/selectable'
import {isPathInLocation} from 'route'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './section.module.css'

const Section = ({path, captureMouseEvents = true, children}) => (
    <Selectable
        id={path}
        className={styles.section}
        active={isPathInLocation(path)}
        captureMouseEvents={captureMouseEvents}>
        {children}
    </Selectable>
)

Section.propTypes = {
    captureMouseEvents: PropTypes.any,
    children: PropTypes.any,
    path: PropTypes.string,
}

export default Section
