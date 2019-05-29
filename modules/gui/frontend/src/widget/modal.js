import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './modal.module.css'

export const Modal = ({onClick, children}) =>
    <Portal type='global' center>
        <div className={styles.modal} onClick={e => {
            e.stopPropagation()
            onClick && onClick()
        }}>
            {children}
        </div>
    </Portal>

Modal.propTypes = {
    children: PropTypes.any.isRequired,
    onClick: PropTypes.func
}
