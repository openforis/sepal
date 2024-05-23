import PropTypes from 'prop-types'
import React from 'react'

import {Icon} from './icon'
import {Shape} from './shape'
import styles from './tag.module.css'

export class Tag extends React.Component {
    render() {
        const {size} = this.props
        return (
            <Shape
                shape='pill'
                look='transparent'
                size={size}
                disableHover>
                <div className={styles.contents}>
                    {this.renderIcon()}
                    {this.renderContents()}
                </div>
            </Shape>
        )
    }

    renderIcon() {
        const {icon} = this.props
        return icon ? (
            <Icon name={icon}/>
        ) : null
    }

    renderContents() {
        const {label, children} = this.props
        return children ? children : label
    }
}

Tag.propTypes = {
    children: PropTypes.any,
    label: PropTypes.any,
    size: PropTypes.any
}

Tag.defaultProps = {
    size: 'normal'
}
