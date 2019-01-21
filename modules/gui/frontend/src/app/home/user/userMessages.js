import {Button, ButtonGroup} from 'widget/button'
import {Msg, msg} from 'translate'
import {connect} from 'store'
import Markdown from 'react-markdown'
import Notifications from 'app/notifications'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import UserMessage from './userMessage'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './userMessages.module.css'

const mapStateToProps = state => {
    const currentUser = state.user.currentUser
    return {
        isAdmin: currentUser.roles && currentUser.roles.includes('application_admin'),
        userMessages: state.user.userMessages,
        panel: state.ui && state.ui.userMessages,
        modal: state.ui && state.ui.modal
    }
}

export const showUserMessages = () =>
    actionBuilder('USER_MESSAGES')
        .set('ui.userMessages', 'SHOW_MESSAGES')
        .set('ui.modal', true)
        .dispatch()

export const closePanel = () =>
    actionBuilder('USER_MESSAGES')
        .del('ui.userMessages')
        .del('ui.modal')
        .dispatch()

class UserMessages extends React.Component {
    state = {
        selectedMessage: null
    }

    updateMessage(message) {
        const {id} = message
        this.props.stream('REQUEST_UPDATE_USER_MESSAGE',
            api.user.updateMessage$(message),
            message => {
                actionBuilder('UPDATE_USER_MESSAGE')
                    .assignOrAddValueByTemplate('user.userMessages', {message: {id}}, {message, state: 'UNREAD'})
                    .dispatch()
                // Notifications.success('userMessage.update').dispatch()
            },
            error => Notifications.caught('userMessage.update', null, error).dispatch()
        )
        this.editMessage(null)
    }

    removeMessage(message) {
        const {id} = message
        this.props.stream('REQUEST_REMOVE_USER_MESSAGE',
            api.user.removeMessage$(message),
            () => {
                actionBuilder('REMOVE_USER_MESSAGE')
                    .delValueByTemplate('user.userMessages', {message: {id}})
                    .dispatch()
                Notifications.success('userMessage.remove').dispatch()
            },
            error => Notifications.caught('userMessage.remove', null, error).dispatch()
        )
    }

    updateUserMessageState(userMessage) {
        const id = userMessage.message.id
        const state = userMessage.state
        this.props.stream('REQUEST_UPDATE_USER_MESSAGE_STATE',
            api.user.updateMessageState$(userMessage),
            () => {
                actionBuilder('UPDATE_USER_MESSAGE_STATE', {id, state})
                    .assignValueByTemplate('user.userMessages', {message: {id}}, {state})
                    .dispatch()
                // Notifications.success('userMessage.updateState').dispatch()
            },
            error => Notifications.caught('userMessage.updateState', null, error).dispatch()
        )
    }

    buttonHandler() {
        const {panel, modal} = this.props
        panel
            ? closePanel()
            : !modal && showUserMessages()
    }

    toggleMessageState(userMessage) {
        const nextState = state => {
            switch(state) {
            case 'READ':
                return 'UNREAD'
            case 'UNREAD':
                return 'READ'
            default:
                throw new Error(`Unsupported message state "${state}"`)
            }
        }
        this.updateUserMessageState({
            ...userMessage,
            state: nextState(userMessage.state)
        })
    }

    newMessage() {
        this.editMessage({})
    }

    editMessage(userMessage) {
        this.setState(prevState => ({
            ...prevState,
            selectedMessage: userMessage
        }))
    }

    renderButton() {
        const {className, modal, userMessages} = this.props
        const unread = _.filter(userMessages, {state: 'UNREAD'}).length
        return (
            <Button
                chromeless
                look='transparent'
                size='large'
                additionalClassName={[className, unread ? styles.unread : null].join(' ')}
                icon='bell'
                onClick={() => this.buttonHandler()}
                tooltip={msg('home.sections.user.messages')}
                tooltipPlacement='top'
                tooltipDisabled={modal}/>
        )
    }

    renderMessages() {
        const {userMessages} = this.props
        if (userMessages.length) {
            const sortedUserMessages = _.orderBy(userMessages, userMessage => moment(userMessage.message.creationTime) || moment(), 'desc')
            return (
                <div className={styles.messages}>
                    <ul>
                        {sortedUserMessages.map((userMessage, index) => this.renderMessage(userMessage, index))}
                    </ul>
                </div>
            )
        } else {
            return (
                <div>
                    {msg('userMessages.noMessages')}
                </div>
            )
        }
    }

    renderAdminButtons(message) {
        return (
            <ButtonGroup>
                <Button
                    chromeless
                    look='transparent'
                    icon='edit'
                    tooltip={msg('userMessages.edit')}
                    onClick={() => this.editMessage(message)}
                />
                <Button
                    chromeless
                    look='transparent'
                    icon='trash'
                    tooltip={msg('userMessages.remove')}
                    onClickHold={() => this.removeMessage(message)}
                />
            </ButtonGroup>
        )
    }

    renderMessageStateButton(userMessage) {
        const {state} = userMessage
        return (
            <Button
                chromeless
                look='transparent'
                size='large'
                shape='none'
                icon={state === 'UNREAD' ? 'bell' : 'check'}
                additionalClassName={[styles.dot, styles[state]].join(' ')}
                onClick={() => this.toggleMessageState(userMessage)}
                tooltip={msg(`userMessages.state.${state}`)}
                tooltipPlacement='top'
            />
        )
    }

    renderMessage(userMessage, index) {
        const {isAdmin} = this.props
        const author = userMessage.message.username
        const creationTime = userMessage.message.creationTime
        return (
            <li key={index} className={[lookStyles.look, lookStyles.transparent, lookStyles.nonInteractive].join(' ')}>
                <div className={styles.header}>
                    <div>
                        {this.renderMessageStateButton(userMessage)}
                        <span className={[styles.subject, styles[userMessage.state]].join(' ')}>
                            {userMessage.message.subject}
                        </span>
                    </div>
                    {isAdmin ? this.renderAdminButtons(userMessage.message) : null}
                </div>
                <div className={styles.info}>
                    <Msg id='userMessages.author' author={author}/>
                    {creationTime ? moment(creationTime).fromNow() : ''}
                </div>
                <Markdown className={styles.contents} source={userMessage.message.contents}/>
            </li>
        )
    }

    renderMessagesPanel() {
        const {isAdmin} = this.props
        return (
            <Portal>
                <Panel
                    className={styles.panel}
                    statePath='userMessages'
                    center
                    modal
                    onCancel={() => closePanel()}>
                    <PanelHeader
                        icon='bell'
                        title={msg('userMessages.title')}/>
                    <PanelContent>
                        {this.renderMessages()}
                    </PanelContent>
                    <PanelButtons
                        additionalButtons={isAdmin ? [{
                            key: 'post',
                            look: 'add',
                            icon: 'pencil-alt',
                            label: msg('userMessages.post'),
                            onClick: () => this.newMessage()
                        }] : []}/>
                </Panel>
            </Portal>
        )
    }

    renderMessagePanel(message) {
        return (
            <UserMessage
                message={message}
                onApply={message => this.updateMessage(message)}
                onCancel={() => this.editMessage()}/>
        )
    }

    renderPanel() {
        const {selectedMessage} = this.state
        return selectedMessage
            ? this.renderMessagePanel(selectedMessage)
            : this.renderMessagesPanel()
    }

    render() {
        const {panel} = this.props
        return (
            <React.Fragment>
                {this.renderButton()}
                {panel ? this.renderPanel() : null}
            </React.Fragment>
        )
    }
}

UserMessages.propTypes = {
    className: PropTypes.string
}

export default connect(mapStateToProps)(UserMessages)
