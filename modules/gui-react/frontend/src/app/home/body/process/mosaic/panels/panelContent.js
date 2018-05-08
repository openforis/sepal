import PropTypes from 'prop-types'
import React from 'react'
import Icon from 'widget/icon'
import styles from './panelForm.module.css'

const PanelContent = ({icon, onBack, title, className, children}) => {
    const header = onBack ?
        <a
            className={styles.icon}
            onClick={onBack}
            onMouseDown={(e) => e.preventDefault()}>
            <Icon name='arrow-left'/>
        </a> :
        <span className={styles.icon}>
                        <Icon name={icon}/>
                    </span>

    return (
        <div className={className}>
            <div className={styles.header}>
                {header}
                <span className={styles.title}>
                {title}
            </span>
            </div>
            <div className={styles.body}>
                {children}
            </div>
        </div>
    )
}

PanelContent.propTypes = {
    icon: PropTypes.string,
    onBack: PropTypes.func,
    title: PropTypes.string.isRequired,
    className: PropTypes.string.isRequired,
    children: PropTypes.any.isRequired
}

export default PanelContent