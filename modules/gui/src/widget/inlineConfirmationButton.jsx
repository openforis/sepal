import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Keybinding} from '~/widget/keybinding'

import {ButtonGroup} from './buttonGroup'
import {FloatingBox} from './floatingBox'
import styles from './inlineConfirmationButton.module.css'

export class InlineConfirmationButton extends React.Component {
    ref = React.createRef()

    state = {
        showConfirmation: false
    }

    constructor(props) {
        super(props)
        this.renderContents = this.renderContents.bind(this)
        this.onClick = this.onClick.bind(this)
        this.onClickHold = this.onClickHold.bind(this)
        this.showConfirmation = this.showConfirmation.bind(this)
        this.hideConfirmation = this.hideConfirmation.bind(this)
        this.toggleConfirmation = this.toggleConfirmation.bind(this)
    }

    render() {
        return (
            <React.Fragment>
                {this.renderButton()}
                {this.renderPopup()}
            </React.Fragment>
        )
    }

    renderButton() {
        const {busy, chromeless, air, disabled, icon, iconType, label, shape, size, tooltip, tooltipPlacement, width} = this.props
        const {showConfirmation} = this.state
        return (
            <Button
                ref={this.ref}
                busy={busy}
                chromeless={chromeless}
                icon={icon}
                iconType={iconType}
                label={label}
                shape={shape}
                size={size}
                width={width}
                air={air}
                disabled={disabled}
                tooltip={tooltip}
                tooltipDisabled={showConfirmation}
                tooltipPlacement={tooltipPlacement}
                onClick={this.onClick}
                onClickHold={this.onClickHold}
            />
        )
    }

    renderPopup() {
        const {showConfirmation} = this.state
        return showConfirmation ? (
            <FloatingBox
                element={this.ref.current}
                vPlacement='center'
                hPlacement='over-left-or-over-right'
                onBlur={this.toggleConfirmation}>
                {this.renderContents}
            </FloatingBox>
        ) : null
    }

    renderContents({flipped}) {
        return (
            <div className={styles.wrapper}>
                <Keybinding keymap={{'Escape': this.hideConfirmation}}>
                    <ButtonGroup layout='horizontal-nowrap'>
                        {flipped ? this.renderExitButton() : null}
                        {this.renderConfirmationButton()}
                        {!flipped ? this.renderExitButton() : null}
                    </ButtonGroup>
                </Keybinding>
            </div>
        )
    }

    renderConfirmationButton() {
        const {icon, size, air, confirmationLabel, onConfirm} = this.props
        return (
            <Button
                shape='pill'
                look='cancel'
                size={size}
                air={air}
                icon={icon}
                label={confirmationLabel || msg('button.confirm')}
                onClick={onConfirm}/>
        )
    }

    renderExitButton() {
        const {chromeless, shape, size, air, width} = this.props
        return (
            <Button
                chromeless={chromeless}
                icon='xmark'
                shape={shape}
                size={size}
                air={air}
                width={width}
                onClick={this.hideConfirmation}
            />
        )
    }

    showConfirmation() {
        this.setState({showConfirmation: true})
    }

    hideConfirmation() {
        this.setState({showConfirmation: false})
    }

    toggleConfirmation() {
        this.setState(({showConfirmation}) => ({showConfirmation: !showConfirmation}))
    }

    onClick() {
        const {skipConfirmation, onConfirm} = this.props
        skipConfirmation ? onConfirm() : this.toggleConfirmation()
    }

    onClickHold() {
        const {onConfirm} = this.props
        onConfirm()
    }

    componentDidUpdate({disabled: wasDisabled}) {
        const {disabled} = this.props
        if (!wasDisabled && disabled) {
            this.hideConfirmation()
        }
    }
}

InlineConfirmationButton.defaultProps = {
    tooltipPlacement: 'top',
    confirmationIcon: 'exclamation-triangle'
}

InlineConfirmationButton.propTypes = {
    onConfirm: PropTypes.func.isRequired,
    air: PropTypes.any,
    busy: PropTypes.any,
    chromeless: PropTypes.any,
    confirmationLabel: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.any,
    iconType: PropTypes.any,
    label: PropTypes.any,
    shape: PropTypes.any,
    size: PropTypes.any,
    skipConfirmation: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    width: PropTypes.any
}
