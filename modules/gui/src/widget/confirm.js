import {Layout} from './layout'
import {Panel} from '~/widget/panel/panel'
import {msg} from '~/translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './confirm.module.css'

export class Confirm extends React.Component {
    constructor(props) {
        super(props)
        this.renderMessageLine = this.renderMessageLine.bind(this)
    }

    render() {
        const {skip} = this.props
        return skip || this.renderConfirmation()
    }

    renderMessage() {
        const {message} = this.props
        return (
            <div className={styles.message}>
                {message.split('|').map(this.renderMessageLine)}
            </div>
        )
    }

    renderMessageLine(messageLine, index) {
        return (
            <div key={index}>
                {messageLine}
            </div>
        )
    }
    
    renderConfirmation() {
        const {title, label, disabled, onConfirm, onCancel, children} = this.props
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    className={styles.header}
                    icon='exclamation-triangle'
                    title={title || msg('widget.confirm.title')}/>
                <Panel.Content>
                    <Layout type='vertical' spacing='compact'>
                        {this.renderMessage()}
                        {children}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Confirm
                            label={label || msg('widget.confirm.label')}
                            keybinding='Enter'
                            disabled={disabled}
                            onClick={onConfirm}
                        />
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={onCancel}
                        />
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    autoConfirm() {
        const {skip, onConfirm} = this.props
        if (skip) {
            onConfirm && onConfirm()
        }
    }

    componentDidMount() {
        this.autoConfirm()
    }

    componentDidUpdate() {
        this.autoConfirm()
    }
}

Confirm.propTypes = {
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    children: PropTypes.any,
    disabled: PropTypes.any,
    label: PropTypes.string,
    message: PropTypes.string,
    skip: PropTypes.any,
    title: PropTypes.string
}
