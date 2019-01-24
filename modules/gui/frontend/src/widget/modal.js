import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './modal.module.css'

export const Modal = ({children}) =>
    <Portal>
        <div className={styles.modal}>
            {children}
        </div>
    </Portal>

Modal.propTypes = {
    children: PropTypes.any.isRequired
}
