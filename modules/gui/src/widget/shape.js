import {Icon} from 'widget/icon'
import {Tooltip} from 'widget/tooltip'
import {compose} from 'compose'
import {withForwardedRef}
    from 'ref'
import PropTypes from 'prop-types'
import React from 'react'
import lookStyles from 'style/look.module.css'
import styles from './shape.module.css'

class _Shape extends React.Component {
    classNames() {
        const {chromeless, className, additionalClassName, look, size, shape, air,
            alignment, width, disabled, disableHover, disableTransitions} = this.props
        return className ? className : [
            styles.shape,
            styles[`size-${size}`],
            styles[`shape-${shape}`],
            styles[`air-${air}`],
            styles[`alignment-${alignment}`],
            styles[`width-${width}`],
            lookStyles.look,
            lookStyles[look],
            chromeless ? lookStyles.chromeless : null,
            disableTransitions ? lookStyles.noTransitions : null,
            disabled ? lookStyles.disabled : null,
            disableHover ? lookStyles.hoverDisabled : null,
            additionalClassName
        ].join(' ')
    }

    renderTooltip(contents) {
        const {tooltip, tooltipPlacement, tooltipDisabled, tooltipDelay, disabled} = this.props
        return tooltip && !tooltipDisabled && !disabled ? (
            <Tooltip
                msg={tooltip}
                placement={tooltipPlacement}
                delay={tooltipDelay}>
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
        const {icon, iconType, iconAttributes, iconVariant} = this.props
        return (
            <Icon
                name={icon}
                type={iconType}
                variant={iconVariant}
                attributes={iconAttributes}
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
        const {icon, iconPlacement, content, tail, children} = this.props
        return (
            <div className={styles.contents}>
                {icon && iconPlacement === 'left' ? this.renderIcon() : null}
                {children ? children : content}
                {icon && iconPlacement === 'right' ? this.renderIcon() : null}
                {tail}
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
    air: PropTypes.oneOf(['normal', 'more']),
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    children: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    content: PropTypes.any,
    disabled: PropTypes.any,
    disableHover: PropTypes.any,
    disableTransitions: PropTypes.any,
    icon: PropTypes.string,
    iconAttributes: PropTypes.any,
    iconPlacement: PropTypes.oneOf(['left', 'right']),
    iconType: PropTypes.string,
    iconVariant: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'selected', 'transparent', 'add', 'apply', 'cancel']),
    shape: PropTypes.oneOf(['rectangle', 'pill', 'circle', 'none']),
    shown: PropTypes.any,
    size: PropTypes.oneOf(['x-small', 'small', 'normal', 'large', 'x-large', 'xx-large']),
    tail: PropTypes.string,
    tooltip: PropTypes.any,
    tooltipDelay: PropTypes.any,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    width: PropTypes.oneOf(['fit', 'fill'])
}

Shape.defaultProps = {
    air: 'normal',
    alignment: 'left',
    iconPlacement: 'left',
    iconVariant: 'normal',
    look: 'default',
    shape: 'rectangle',
    shown: true,
    size: 'normal',
    width: 'fit'
}
