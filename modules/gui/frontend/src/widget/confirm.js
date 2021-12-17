import {Panel} from 'widget/panel/panel'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './confirm.module.css'

export default class Confirm extends React.Component {
    render() {
        const {title, message, label, onConfirm, onCancel, children} = this.props
        const confirm = () => onConfirm()
        const cancel = () => onCancel()
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='exclamation-triangle'
                    title={title || msg('widget.confirm.title')}/>
                <Panel.Content>
                    <div className={styles.message}>
                        {message || children}
                    </div>
                </Panel.Content>
                <Panel.Buttons onEnter={confirm} onEscape={cancel}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Confirm
                            label={label}
                            onClick={confirm}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Cancel onClick={cancel}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }
}

Confirm.propTypes = {
    label: PropTypes.string.isRequired,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    children: PropTypes.any,
    message: PropTypes.string,
    title: PropTypes.string
}
