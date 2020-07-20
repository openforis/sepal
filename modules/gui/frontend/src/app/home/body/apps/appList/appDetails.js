import {AppItem} from './appItem'
import {Markdown} from 'widget/markdown'
import {Panel} from 'widget/panel/panel'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './appDetails.module.css'

export const AppDetails = props => {
    const {app, onClose} = props
    return (
        <Panel className={styles.panel} type='modal'>
            <Panel.Header>
                <AppItem app={app}/>
            </Panel.Header>
            <Panel.Content
                scrollable
                className={styles.panelContent}>
                <Markdown source={app.description}/>
            </Panel.Content>
            <Panel.Buttons onEnter={onClose} onEscape={onClose}>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Close onClick={onClose}/>
                </Panel.Buttons.Main>
            </Panel.Buttons>
        </Panel>
    )
}

AppDetails.propTypes = {
    app: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired
}
