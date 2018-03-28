import React from 'react'
import PropTypes from 'prop-types'
import styles from './centered-panel.module.css'

const CenteredPanel = ({className, children}) =>
    <div className={`${styles.container} ${className}`}>
        {children}
    </div>

CenteredPanel.propTypes = {
    className: PropTypes.string,
    children: PropTypes.children
}

export default CenteredPanel