import {Selectable} from 'widget/selectable'
import {isPathInLocation} from 'route'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './body.module.css'

const Section = ({path, captureMouseEvents = true, children}) =>
    <Selectable
        active={isPathInLocation(path)}
        captureMouseEvents ={captureMouseEvents}
        classNames={{
            default: styles.section,
            in: styles.in,
            out: styles.out
        }}>
        {children}
    </Selectable>

Section.propTypes = {
    captureMouseEvents: PropTypes.any,
    path: PropTypes.string,
    children: PropTypes.any,
}

export default Section
