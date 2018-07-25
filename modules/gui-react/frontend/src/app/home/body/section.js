import PropTypes from 'prop-types'
import React from 'react'
import {isPathInLocation} from 'route'
import {Selectable} from 'widget/selectable'
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
    path: PropTypes.string,
    captureMouseEvents: PropTypes.any,
    children: PropTypes.any
}

export default Section