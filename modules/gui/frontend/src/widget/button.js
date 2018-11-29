import {HoldButton} from 'widget/holdButton'
import {Link} from 'route'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import lookStyles from 'style/look.module.css'
import styles from './button.module.css'

const renderContents = ({icon, iconType, label, children}) =>
    children ? children : (
        <div className={styles.contents}>
            {icon ? <Icon name={icon} type={iconType}/> : null}
            {label ? <span>{label}</span> : null}
        </div>
    )

const classNames = ({chromeless, className, additionalClassName, look, size, shape, onClickHold}) =>
    className ? className : [
        styles.button,
        chromeless ? styles.chromeless : null,
        styles[size],
        styles[shape],
        lookStyles.look,
        lookStyles[look],
        chromeless ? lookStyles.chromeless : null,
        onClickHold ? styles.hold : null,
        additionalClassName
    ].join(' ')

const handleMouseDown = (e, {onMouseDown}) => {
    onMouseDown && onMouseDown(e)
}

const handleClick = (e, {onClick, download, downloadUrl, downloadFilename}) => {
    onClick && onClick(e)
    downloadUrl && download(downloadUrl, downloadFilename)
}

const handleClickHold = (e, {onClickHold}) => {
    onClickHold && onClickHold(e)
}

const renderButton = ({type, chromeless, className, additionalClassName, look, size, shape, tabIndex,
    onMouseDown, onClick, download, downloadUrl, downloadFilename, onClickHold, shown, disabled}, contents) =>
    <HoldButton
        type={type}
        className={classNames({chromeless, className, additionalClassName, look, size, shape, onClickHold})}
        style={{visibility: shown ? 'visible' : 'hidden'}}
        tabIndex={tabIndex}
        disabled={disabled || !shown}
        onMouseDown={e => handleMouseDown(e, {onMouseDown})}
        onClick={e => handleClick(e, {onClick, download, downloadUrl, downloadFilename})}
        onClickHold={e => handleClickHold(e, {onClickHold})}
    >
        {contents}
    </HoldButton>

const renderPropagationStopper = ({stopPropagation}, contents) =>
    stopPropagation ? (
        <span onClick={e => {
            e.stopPropagation()
        }}>
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

const download = (url, filename) => {
    // create hidden anchor, attach to DOM, click it and remove it from the DOM
    var downloadElement = document.createElement('a')
    downloadElement.setAttribute('style', 'display: none')
    downloadElement.setAttribute('href', url)
    downloadElement.setAttribute('download', filename)
    document.body.appendChild(downloadElement)
    downloadElement.click()
    downloadElement.remove()
}

export const Button = ({
    type = 'button',
    chromeless,
    className,
    additionalClassName,
    look = 'default',
    size = 'normal',
    shape = 'rectangle',
    tabIndex,
    icon,
    iconType,
    label,
    onMouseDown,
    onClick,
    onClickHold,
    downloadUrl,
    downloadFilename,
    link,
    shown = true,
    disabled,
    stopPropagation = true,
    children,
    tooltip,
    tooltipPlacement,
    tooltipDisabled
}) =>
    renderLink({link, shown, disabled},
        renderTooltip({tooltip, tooltipPlacement, tooltipDisabled, shown, disabled},
            renderPropagationStopper({stopPropagation},
                renderButton({type, chromeless, className, additionalClassName, look, size, shape, tabIndex, onMouseDown,
                    onClick, download, downloadUrl, downloadFilename, onClickHold, shown, disabled},
                renderContents({icon, iconType, label, children})
                )
            )
        )
    )

Button.propTypes = {
    additionalClassName: PropTypes.string,
    children: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    downloadFilename: PropTypes.any,
    downloadUrl: PropTypes.any,
    icon: PropTypes.string,
    iconType: PropTypes.string,
    label: PropTypes.string,
    link: PropTypes.string,
    look: PropTypes.oneOf(['default', 'highlight', 'transparent', 'apply', 'cancel']),
    shape: PropTypes.oneOf(['rectangle', 'pill', 'circle', 'none']),
    shown: PropTypes.any,
    size: PropTypes.oneOf(['small', 'normal', 'large', 'x-large']),
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
    children: PropTypes.any.isRequired
}
