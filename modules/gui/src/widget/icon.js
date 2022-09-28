import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {fab} from '@fortawesome/free-brands-svg-icons'
import {far} from '@fortawesome/free-regular-svg-icons'
import {fas} from '@fortawesome/free-solid-svg-icons'
import {library} from '@fortawesome/fontawesome-svg-core'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import _ from 'lodash'
import styles from './icon.module.css'

library.add(fab)
library.add(far)
library.add(fas)

const fontAwesomeCollection = type => {
    switch (type) {
    case 'solid':
        return 'fas'
    case 'regular':
        return 'far'
    case 'brands':
        return 'fab'
    default:
        throw Error(`Unsupported icon type: ${type}`)
    }
}

export default class Icon extends React.Component {
    render() {
        const {tooltip, tooltipPlacement, tooltipDelay, tooltipDisabled} = this.props
        return (
            <Tooltip
                msg={tooltip}
                placement={tooltipPlacement}
                delay={tooltipDelay}
                disabled={tooltipDisabled}>
                {this.renderIcon()}
            </Tooltip>
        )
    }

    classNames() {
        const {className, variant, dimmed} = this.props
        return [
            styles[`variant-${variant}`],
            dimmed ? styles.dimmed : null,
            className
        ].join(' ')
    }

    renderIcon() {
        const {name, type, size, attributes} = this.props
        const filteredAttributes = _.omit({spin: name === 'spinner', ...attributes}, [
            'icon', 'name', 'type', 'className', 'variant'
        ])
        const icon = [fontAwesomeCollection(type || 'solid'), name]
        return (
            <FontAwesomeIcon
                icon={icon}
                size={size}
                className={this.classNames()}
                {...filteredAttributes}
            />
        )
    }
}

Icon.propTypes = {
    name: PropTypes.string.isRequired,
    attributes: PropTypes.object,
    className: PropTypes.string,
    dimmed: PropTypes.any,
    size: PropTypes.string,
    tooltip: PropTypes.any,
    tooltipDelay: PropTypes.number,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    type: PropTypes.oneOf(['solid', 'regular', 'brands']),
    variant: PropTypes.oneOf(['normal', 'error', 'info', 'success', 'warning'])
}

Icon.defaultProps = {
    size: '1x',
    type: 'solid',
    variant: 'normal'
}
