import {Panel} from 'widget/panel/panel'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './confirm.module.css'

export default class Confirm extends React.Component {
    render() {
        const {title, message, label, onConfirm, onCancel, children} = this.props
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
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Confirm
                            label={label || msg('widget.confirm.label')}
                            keybinding='Enter'
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
}

Confirm.propTypes = {
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    children: PropTypes.any,
    label: PropTypes.string,
    message: PropTypes.string,
    title: PropTypes.string
}
