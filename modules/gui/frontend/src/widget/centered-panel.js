import PropTypes from 'prop-types'
import React from 'react'
import styles from './centered-panel.module.css'

const CenteredPanel = ({className, children}) =>
    <div className={`${styles.container} ${className}`}>
        {children}
    </div>

CenteredPanel.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}

export default CenteredPanel
