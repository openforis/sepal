import {compose} from 'compose'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import lookStyles from 'style/look.module.css'
import styles from './shape.module.css'
import withForwardedRef from 'ref'

class _Shape extends React.Component {
    active() {
        const {shown = true, disabled = false} = this.props
        return shown && !disabled
    }

    nonInteractive() {
        return !this.active()
    }

    classNames() {
        const {chromeless, className, additionalClassName, look, size, shape,
            alignment, width, disableTransitions} = this.props
        return className ? className : [
            styles.shape,
            styles[size],
            styles[shape],
            styles[alignment],
            styles[width],
            lookStyles.look,
            lookStyles[look],
            chromeless ? lookStyles.chromeless : null,
            disableTransitions ? lookStyles.noTransitions : null,
            this.nonInteractive() ? lookStyles.nonInteractive : null,
            additionalClassName
        ].join(' ')
    }

    renderTooltip(contents) {
        const {tooltip, tooltipPlacement, tooltipDisabled, disabled} = this.props
        return tooltip && !tooltipDisabled && !disabled ? (
            <Tooltip msg={tooltip} placement={tooltipPlacement}>
                {contents}
            </Tooltip>
        ) : contents
    }

    renderShape(contents) {
        const {disabled, forwardedRef} = this.props
        return (
            <div
                ref={forwardedRef}
                className={this.classNames()}
                disabled={disabled}
            >
                {contents}
            </div>
        )
    }

    renderIcon() {
        const {icon, iconType, iconFlipHorizontal} = this.props
        return (
            <Icon
                name={icon}
                type={iconType}
                flip={iconFlipHorizontal ? 'horizontal' : null}
            />
        )
    }

    renderLabel() {
        const {label} = this.props
        return (
            <span>{label}</span>
        )
    }

    renderContents() {
        const {icon, iconPlacement, content, children} = this.props
        return (
            <div className={styles.contents}>
                {icon && iconPlacement === 'left' ? this.renderIcon() : null}
                {children ? children : content}
                {icon && iconPlacement === 'right' ? this.renderIcon() : null}
            </div>
        )
    }

    render() {
        const {shown = true} = this.props
        return shown ? (
            this.renderTooltip(
                this.renderShape(
                    this.renderContents()
                )
            )
        ) : null
    }
}

export const Shape = compose(
    _Shape,
    withForwardedRef()
)

Shape.propTypes = {
    additionalClassName: PropTypes.string,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    children: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    content: PropTypes.any,
    disabled: PropTypes.any,
    disableTransitions: PropTypes.any,
    icon: PropTypes.string,
    iconFlipHorizontal: PropTypes.any,
    iconPlacement: PropTypes.oneOf(['left', 'right']),
    iconType: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'selected', 'transparent', 'add', 'apply', 'cancel']),
    shape: PropTypes.oneOf(['rectangle', 'pill', 'circle', 'none']),
    shown: PropTypes.any,
    size: PropTypes.oneOf(['small', 'normal', 'large', 'x-large', 'xx-large']),
    tooltip: PropTypes.string,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    width: PropTypes.oneOf(['fit', 'fill'])
}

Shape.defaultProps = {
    alignment: 'left',
    iconPlacement: 'left',
    look: 'default',
    shape: 'rectangle',
    shown: true,
    size: 'normal',
    width: 'fit'
}
