import {Selectable} from 'widget/selectable'
import {StaticMap} from '../map/map'
import {isPathInLocation} from 'route'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './section.module.css'

const content = (staticMap, children) =>
    staticMap
        ? <StaticMap>{children}</StaticMap>
        : children

const Section = ({path, captureMouseEvents, staticMap = true, children}) => (
    <Selectable
        id={path}
        className={styles.section}
        active={isPathInLocation(path)}
        captureMouseEvents={captureMouseEvents}>
        {content(staticMap, children)}
    </Selectable>
)

Section.propTypes = {
    captureMouseEvents: PropTypes.any,
    children: PropTypes.any,
    path: PropTypes.string,
}

Section.defaultProps = {
    captureMouseEvents: true
}

export default Section
