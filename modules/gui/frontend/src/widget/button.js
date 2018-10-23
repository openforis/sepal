import {Link} from 'route'
import Hammer from 'react-hammerjs'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import lookStyles from 'style/look.module.css'
import styles from './button.module.css'

const hammerOptions = ({onClick, onClickHold}) => {
    const tapOnly = {
        recognizers: {
            tap: {
                time: 10000
            },
            press: {
                enable: false
            }
        }
    }
    const tapAndPress = {
        recognizers: {
            tap: {
                time: 750
            },
            press: {
                time: 750
            }
        }
    }
    const pressOnly = {
        recognizers: {
            tap: {
                enable: false
            },
            press: {
                time: 750
            }
        }
    }
    const nothing = {
        recognizers: {
            tap: {
                enable: false
            },
            press: {
                enable: false
            }
        }
    }
    return onClick
        ? (onClickHold ? tapAndPress : tapOnly)
        : (onClickHold ? pressOnly : nothing)
}

const renderContents = ({icon, label, children}) =>
    children ? children : (
        <div className={styles.contents}>
            {icon ? <Icon name={icon}/> : null}
            {label ? <span>{label}</span> : null}
        </div>
    )

const classNames = ({className, look, size, onClickHold}) =>
    className ? className : [
        styles.button,
        styles[size],
        lookStyles.look,
        lookStyles[look],
        onClickHold ? styles.hold : null
    ].join(' ')

const renderButton = ({type, className, look, size, tabIndex, onMouseDown, onClickHold, shown, disabled}, contents) =>
    <button
        type={type}
        className={classNames({className, look, size, onClickHold})}
        style={{visibility: shown ? 'visible' : 'hidden'}}
        tabIndex={tabIndex}
        disabled={disabled || !shown}
        onMouseDown={e => onMouseDown && onMouseDown(e)}>
        {contents}
    </button>

const renderHammer = ({onClick, onClickHold, shown, disabled}, contents) =>
    shown && !disabled ? (
        <Hammer
            onTap={e => onClick && onClick(e.srcEvent, e)}
            onPressUp={e => onClickHold && onClickHold(e.srcEvent, e)}
            options={hammerOptions({onClick, onClickHold})}>
            {contents}
        </Hammer>
    ) : contents

const renderPropagationStopper = ({stopPropagation}, contents) =>
    stopPropagation ? (
        <span onClick={e => e.stopPropagation()}>
            {contents}
        </span>
    ) : contents

const renderTooltip = ({tooltip, tooltipPlacement, tooltipDisabled, shown, disabled}, contents) =>
    tooltip && !tooltipDisabled && shown && !disabled ? (
        <Tooltip msg={tooltip} placement={tooltipPlacement}>
            {contents}
        </Tooltip>
    ) : contents

const renderLink = ({link, shown, disabled}, contents) =>
    link && shown && !disabled ? (
        <Link to={link} onMouseDown={e => e.preventDefault()}>
            {contents}
        </Link>
    ) : contents

export const Button = ({
    type = 'button',
    className,
    look = 'default',
    size = 'normal',
    tabIndex,
    icon,
    label,
    onMouseDown,
    onClick,
    onClickHold,
    link,
    shown = true,
    disabled,
    stopPropagation,
    children,
    tooltip,
    tooltipPlacement,
    tooltipDisabled
}) =>
    renderLink({link, shown, disabled},
        renderTooltip({tooltip, tooltipPlacement, tooltipDisabled, shown, disabled},
            renderPropagationStopper({stopPropagation},
                renderHammer({onClick, onClickHold, shown, disabled},
                    renderButton({type, className, look, size, tabIndex, onMouseDown, onClickHold, shown, disabled},
                        renderContents({icon, label, children})
                    )
                )
            )
        )
    )

Button.propTypes = {
    children: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
    className: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.string,
    link: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'transparent', 'apply', 'cancel']),
    shown: PropTypes.any,
    size: PropTypes.oneOf(['normal', 'large', 'x-large']),
    stopPropagation: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    type: PropTypes.string,
    onClick: PropTypes.func,
    onClickHold: PropTypes.func,
    onMouseDown: PropTypes.func
}

export const ButtonGroup = ({children}) =>
    <div className={styles.group}>
        {children}
    </div>

ButtonGroup.propTypes = {
    children: PropTypes.array.isRequired
}
