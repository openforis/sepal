import {Link} from 'route'
import Hammer from 'react-hammerjs'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import styles from './button.module.css'

const renderContents = ({icon, label, children}) =>
    children ? children : (
        <div className={styles.contents}>
            {icon ? <Icon name={icon}/> : null}
            {label ? <span>{label}</span> : null}
        </div>
    )

const classNames = ({className, selected}) =>
    className ? className : [
        styles.button,
        styles.default,
        selected ? styles.selected : null
    ].join(' ')

const renderButton = ({type, className, ref, tabIndex, onMouseDown, shown, disabled, selected}, contents) =>
    <button
        type={type}
        className={classNames({className, selected})}
        style={{visibility: shown ? 'visible' : 'hidden'}}
        ref={ref}
        tabIndex={tabIndex}
        disabled={disabled}
        onMouseDown={onMouseDown}>
        {contents}
    </button>

const renderHammer = ({onClick, disabled}, contents) =>
    onClick && !disabled ? (
        <Hammer onTap={onClick}>
            {contents}
        </Hammer>
    ) : contents

const renderTooltip = ({tooltip, tooltipPlacement, tooltipDisabled, disabled}, contents) =>
    tooltip && !tooltipDisabled && !disabled ? (
        <Tooltip msg={tooltip} placement={tooltipPlacement}>
            {contents}
        </Tooltip>
    ) : contents

const renderLink = ({link, disabled}, contents) =>
    link && !disabled ? (
        <Link to={link} onMouseDown={e => e.preventDefault()}>
            {contents}
        </Link>
    ) : contents

export const Button = ({
    type = 'button',
    className,
    ref,
    tabIndex,
    icon,
    label,
    onMouseDown,
    onClick,
    link,
    shown = true,
    disabled,
    selected,
    children,
    tooltip,
    tooltipPlacement,
    tooltipDisabled
}) =>
    renderLink({link, disabled},
        renderTooltip({tooltip, tooltipPlacement, tooltipDisabled},
            renderHammer({onClick, disabled},
                renderButton({type, className, ref, tabIndex, onMouseDown, shown, disabled, selected},
                    renderContents({icon, label, children})
                )
            )
        )
    )

Button.propTypes = {
    children: PropTypes.array,
    className: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    link: PropTypes.string,
    ref: PropTypes.object,
    selected: PropTypes.any,
    shown: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    type: PropTypes.string,
    onClick: PropTypes.func,
    onMouseDown: PropTypes.func
}
