import React from 'react'
import {isPathInLocation} from 'route'
import {Selectable} from 'widget/selectable'
import PropTypes from 'prop-types'
import styles from './body.module.css'

const Section = ({path, children}) =>
    <Selectable
        active={isPathInLocation(path)}
        classNames={{
            default: styles.section,
            in: styles.in,
            out: styles.out
        }}>
        {children}
    </Selectable>

Section.propTypes = {
    location: PropTypes.object,
    path: PropTypes.string,
    children: PropTypes.any
}

export default Section