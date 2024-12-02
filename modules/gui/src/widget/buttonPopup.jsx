import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {Button} from '~/widget/button'
import {FloatingBox} from '~/widget/floatingBox'
import {Icon} from '~/widget/icon'

import {ButtonGroup} from './buttonGroup'
import styles from './buttonPopup.module.css'

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class _ButtonPopup extends React.Component {
    buttonRef = React.createRef()
    popupRef = React.createRef()
    state = {
        showPopup: false
    }

    constructor() {
        super()
        this.handleBlur = this.handleBlur.bind(this)
        this.togglePopup = this.togglePopup.bind(this)
        this.onClick = this.onClick.bind(this)
    }

    render() {
        const {className} = this.props
        const {showPopup} = this.state
        return (
            <div className={[styles.container, className].join(' ')}>
                {this.renderButton()}
                {showPopup ? this.renderPopup() : null}
            </div>
        )
    }

    renderButton() {
        const {onClick} = this.props
        return onClick
            ? this.renderMultiButton()
            : this.renderSingleButton()
    }

    renderSingleButton() {
        const {disabled, chromeless, shape, look, icon, size, tooltip, tooltipPlacement, width, onMouseOver, onMouseOut} = this.props
        return (
            <Button
                ref={this.buttonRef}
                chromeless={chromeless}
                shape={shape}
                look={look}
                icon={icon}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                size={size}
                width={width}
                onClick={this.togglePopup}
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}
                disabled={disabled}
                label={this.getLabel()}
                tail={this.getChevron()}
            />
        )
    }

    renderMultiButton() {
        const {disabled, chromeless, shape, look, icon, size, tooltip, tooltipPlacement, width, onMouseOver, onMouseOut} = this.props
        return (
            <ButtonGroup
                ref={this.buttonRef}
                spacing='none'
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}>
                <Button
                    chromeless={chromeless}
                    shape={shape}
                    look={look}
                    icon={icon}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    size={size}
                    width={width}
                    onClick={this.onClick}
                    disabled={disabled}
                    label={this.getLabel()}
                />
                <Button
                    chromeless={chromeless}
                    shape={shape}
                    look={look}
                    icon={this.getIcon()}
                    iconDimmed={this.getIconDimmed()}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    size={size}
                    width={width}
                    onClick={this.togglePopup}
                    disabled={disabled}
                />
            </ButtonGroup>
        )
    }

    onClick(e) {
        const {onClick} = this.props
        onClick && onClick(e)
    }

    componentDidMount() {
        const {showPopupOnMount} = this.props
        if (showPopupOnMount) {
            this.setState({showPopup: true})
        }
    }

    getLabel() {
        const {label} = this.props
        const {selectedOption} = this.state
        return (selectedOption && (selectedOption.buttonLabel || selectedOption.label)) || label
    }

    getChevron() {
        const {noChevron} = this.props
        return noChevron
            ? null
            : <Icon name={this.getIcon()} dimmed={this.getIconDimmed()}/>
    }

    getIcon() {
        const {placement} = this.props
        return placement === 'above' ? 'chevron-up' : 'chevron-down'
    }

    getIconDimmed() {
        const {showPopup} = this.state
        return showPopup
    }

    renderPopup() {
        const {disabled, vPlacement, hPlacement} = this.props
        if (disabled) {
            return null
        }
        return this.buttonRef.current && (
            <FloatingBox
                ref={this.popupRef}
                element={this.buttonRef.current}
                className={[
                    styles.popup,
                    styles[`placement-${vPlacement}`]
                ].join(' ')}
                vPlacement={vPlacement}
                hPlacement={hPlacement}
                onBlur={this.handleBlur}>
                {this.renderContent()}
            </FloatingBox>
        )
    }

    renderContent() {
        const {children} = this.props
        return _.isFunction(children)
            ? children(this.handleBlur)
            : children
    }

    togglePopup() {
        this.setState(({showPopup}) => ({showPopup: !showPopup}))
    }

    hidePopup() {
        this.setState({showPopup: false})
    }

    handleBlur(e) {
        const {stayOpenOnBlur} = this.props
        if (e) {
            if (!stayOpenOnBlur) {
                const isButtonClick = e => this.buttonRef.current && this.buttonRef.current.contains(e.target)
                const isPopupClick = e => this.popupRef.current && this.popupRef.current.contains(e.target)
                if (!isButtonClick(e) && !isPopupClick(e)) {
                    this.hidePopup()
                }
            }
        } else {
            this.hidePopup()
        }
    }
}

export const ButtonPopup = compose(
    _ButtonPopup,
    connect(mapStateToProps)
)

ButtonPopup.propTypes = {
    children: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    hPlacement: PropTypes.any,
    icon: PropTypes.string,
    label: PropTypes.any,
    look: PropTypes.string,
    noChevron: PropTypes.any,
    shape: PropTypes.oneOf(['circle', 'rectangle', 'pill']),
    showPopupOnMount: PropTypes.any,
    size: PropTypes.any,
    stayOpenOnBlur: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    vPlacement: PropTypes.oneOf(['above', 'below', 'over-above', 'over-below']),
    width: PropTypes.string,
    onClick: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func,
}

ButtonPopup.defaultProps = {
    vPlacement: 'below',
    hPlacement: 'over-right'
}
