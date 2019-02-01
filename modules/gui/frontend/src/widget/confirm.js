import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/newPanel'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './confirm.module.css'

export default class Confirm extends React.Component {
    render() {
        const {message, onConfirm, onCancel} = this.props
        return (
            <Panel className={styles.panel} modal>
                <PanelHeader
                    icon='exclamation-triangle'
                    title='Confirmation required'/>
                <PanelContent>
                    <div className={styles.message}>
                        {message}
                    </div>
                </PanelContent>
                <PanelButtons
                    buttons={[{
                        type: 'close',
                        label: 'No, thanks',
                        onClick: () => onCancel(),
                    }]}
                    extraButtons={[{
                        type: 'confirm',
                        label: 'Yes, please',
                        onClick: () => onConfirm()
                    }]}
                />
            </Panel>
        )
    }
}

Confirm.propTypes = {
    message: PropTypes.string.isRequired,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired
}
