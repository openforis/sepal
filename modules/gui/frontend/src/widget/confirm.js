import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
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
                <PanelHeader
                    icon='exclamation-triangle'
                    title={title || msg('widget.confirm.title')}/>
                <PanelContent>
                    <div className={styles.message}>
                        {message || children}
                    </div>
                </PanelContent>
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Confirm
                            label={label}
                            onClick={() => onConfirm()}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Cancel
                            onClick={() => onCancel()}/>
                    </PanelButtons.Extra>
                </PanelButtons>
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
