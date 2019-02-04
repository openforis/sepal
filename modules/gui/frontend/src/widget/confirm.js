import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './confirm.module.css'

export default class Confirm extends React.Component {
    render() {
        const {message, label, onConfirm, onCancel} = this.props
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <PanelHeader
                    icon='exclamation-triangle'
                    title='Confirmation required'/>
                <PanelContent>
                    <div className={styles.message}>
                        {message}
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
    message: PropTypes.string.isRequired,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired
}
