import {Link} from 'route'
import Hammer from 'react-hammerjs'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import lookStyles from '../style/look.module.css'
import styles from './button.module.css'

const renderContents = ({icon, label, children}) =>
    children ? children : (
        <div className={styles.contents}>
            {icon ? <Icon name={icon}/> : null}
            {label ? <span>{label}</span> : null}
        </div>
    )

const classNames = ({className, look}) =>
    className ? className : [
        styles.button,
        lookStyles.look,
        lookStyles[look]
    ].join(' ')

const renderButton = ({type, className, look, tabIndex, onMouseDown, shown, disabled}, contents) =>
    <button
        type={type}
        className={classNames({className, look})}
        style={{visibility: shown ? 'visible' : 'hidden'}}
        tabIndex={tabIndex}
        disabled={disabled || !shown}
        onMouseDown={onMouseDown}>
        {contents}
    </button>

const renderHammer = ({onClick, shown, disabled}, contents) =>
    onClick && shown && !disabled ? (
        <Hammer onClick={onClick}>
            {contents}
        </Hammer>
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
    tabIndex,
    icon,
    label,
    onMouseDown,
    onClick,
    link,
    shown = true,
    disabled,
    children,
    tooltip,
    tooltipPlacement,
    tooltipDisabled
}) =>
    renderLink({link, shown, disabled},
        renderTooltip({tooltip, tooltipPlacement, tooltipDisabled, shown, disabled},
            renderHammer({onClick, shown, disabled},
                renderButton({type, className, look, tabIndex, onMouseDown, shown, disabled},
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
    look: PropTypes.oneOf(['default', 'highlight', 'apply', 'cancel']),
    shown: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipDisabled: PropTypes.any,
    tooltipPlacement: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
    type: PropTypes.string,
    onClick: PropTypes.func,
    onMouseDown: PropTypes.func
}
