import React from 'react'
import {isPathInLocation} from 'route'
import {Selectable} from 'widget/selectable'
import PropTypes from 'prop-types'
import styles from './body.module.css'

const Section = ({path, className, children}) =>
    <Selectable
        active={isPathInLocation(path)}
        className={className}
        classNames={{
            default: styles.section,
            in: styles.in,
            out: styles.out
        }}>
        {children}
    </Selectable>

Section.propTypes = {
    path: PropTypes.string,
    className: PropTypes.string,
    children: PropTypes.any
}

export default Section