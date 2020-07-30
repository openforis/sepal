import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faGoogle} from '@fortawesome/free-brands-svg-icons'
import {far} from '@fortawesome/free-regular-svg-icons'
import {fas} from '@fortawesome/free-solid-svg-icons'
import {library} from '@fortawesome/fontawesome-svg-core'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import styles from './icon.module.css'

library.add(faGoogle)
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
        return this.renderTooltip(
            this.renderIcon()
        )
    }

    classNames() {
        const {className, variant, pulse} = this.props
        return [
            styles[`variant-${variant}`],
            pulse ? styles.pulse : null,
            className
        ].join(' ')
    }

    renderTooltip(contents) {
        const {tooltip, tooltipPlacement, tooltipDisabled} = this.props
        return tooltip && !tooltipDisabled
            ? (
                <Tooltip msg={tooltip} placement={tooltipPlacement}>
                    {contents}
                </Tooltip>
            )
            : contents
    }

    renderIcon() {
        const {name, type, size, spin, flipHorizontal, flipVertical, fixedWidth} = this.props
        const flip = flipHorizontal
            ? flipVertical
                ? 'both'
                : 'horizontal'
            : flipVertical
                ? 'vertical'
                : null
        return (
            <i className={styles.icon}>
                <FontAwesomeIcon
                    tag='i'
                    icon={[fontAwesomeCollection(type), name]}
                    fixedWidth={fixedWidth}
                    spin={spin || name === 'spinner'}
                    flip={flip}
                    size={size}
                    className={this.classNames()}
                />
            </i>
        )
    }
}

Icon.propTypes = {
    name: PropTypes.string.isRequired,
    className: PropTypes.string,
    fixedWidth: PropTypes.any,
    flipHorizontal: PropTypes.any,
    flipVertical: PropTypes.any,
    pulse: PropTypes.any,
    size: PropTypes.string,
    spin: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    type: PropTypes.oneOf(['solid', 'regular', 'brands']),
    variant: PropTypes.oneOf(['normal', 'error', 'info', 'success', 'warning'])
}

Icon.defaultProps = {
    fixedWidth: false,
    type: 'solid',
    variant: 'normal'
}
