import {Activator} from 'widget/activation/activator'
import {Button, ButtonGroup} from 'widget/button'
import {Msg, msg} from 'translate'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {activatable} from 'widget/activation/activatable'
import {connect} from 'store'
import {v4 as uuid} from 'uuid'
import Markdown from 'react-markdown'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import SafetyButton from 'widget/safetyButton'
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
        userMessages: state.user.userMessages
    }
}

export const showUserMessages = () =>
    actionBuilder('USER_MESSAGES')
        .set('ui.userMessages', 'SHOW_MESSAGES')
        .dispatch()

export const closePanel = () =>
    actionBuilder('USER_MESSAGES')
        .del('ui.userMessages')
        .dispatch()

class _UserMessages extends React.Component {
    state = {
        selectedMessage: null
    }

    updateMessage(message) {
        const {id = uuid()} = message
        this.props.stream('REQUEST_UPDATE_USER_MESSAGE',
            api.user.updateMessage$({...message, id}),
            message => {
                actionBuilder('UPDATE_USER_MESSAGE')
                    .assign(['user.userMessages', {message: {id}}], {message, state: 'UNREAD'})
                    .dispatch()
                Notifications.success({message: id ? msg('userMessage.update.success') : msg('userMessage.publish.success')})
            },
            error => Notifications.error({message: msg('userMessage.update.error'), error})
        )
        this.editMessage(null)
    }

    removeMessage(message) {
        const {id} = message
        this.props.stream('REQUEST_REMOVE_USER_MESSAGE',
            api.user.removeMessage$(message),
            () => {
                actionBuilder('REMOVE_USER_MESSAGE')
                    .del(['user.userMessages', {message: {id}}])
                    .dispatch()
                Notifications.success({message: msg('userMessage.remove.success')})
            },
            error => Notifications.error({message: msg('userMessage.remove.error'), error})
        )
    }

    updateUserMessageState(userMessage) {
        const id = userMessage.message.id
        const state = userMessage.state
        this.props.stream('REQUEST_UPDATE_USER_MESSAGE_STATE',
            api.user.updateMessageState$(userMessage),
            () => {
                actionBuilder('UPDATE_USER_MESSAGE_STATE', {id, state})
                    .assign(['user.userMessages', {message: {id}}], {state})
                    .dispatch()
                // Notifications.success({message: msg('userMessage.updateState.success')})
            },
            error => Notifications.error({message: msg('userMessage.updateState.error'), error})
        )
    }

    buttonHandler() {
        const {modal} = this.props
        !modal && showUserMessages()
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

    renderAdminControls(message) {
        return (
            <ButtonGroup>
                <Button
                    chromeless
                    shape='circle'
                    size='large'
                    icon='edit'
                    tooltip={msg('userMessages.edit')}
                    onClick={() => this.editMessage(message)}
                />
                <SafetyButton
                    chromeless
                    shape='circle'
                    size='large'
                    icon='trash'
                    tooltip={msg('userMessages.remove')}
                    message={msg('userMessages.removeConfirmation', {subject: message.subject})}
                    onConfirm={() => this.removeMessage(message)}
                />
            </ButtonGroup>
        )
    }

    renderSubject(userMessage) {
        const {state} = userMessage
        return (
            <Button
                chromeless
                look='transparent'
                size='large'
                shape='none'
                icon={state === 'UNREAD' ? 'bell' : 'check'}
                label={userMessage.message.subject}
                additionalClassName={[styles.subject, styles[state]].join(' ')}
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
                    {this.renderSubject(userMessage)}
                    {isAdmin ? this.renderAdminControls(userMessage.message) : null}
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
        const {isAdmin, activatable: {deactivate}} = this.props
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <PanelHeader
                    icon='bell'
                    title={msg('userMessages.title')}/>
                <PanelContent>
                    {this.renderMessages()}
                </PanelContent>
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Close
                            onClick={() => deactivate()}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Add
                            label={msg('userMessages.post')}
                            onClick={() => this.newMessage()}
                            shown={isAdmin}/>
                    </PanelButtons.Extra>
                </PanelButtons>
            </Panel>
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

    render() {
        const {selectedMessage} = this.state
        return selectedMessage
            ? this.renderMessagePanel(selectedMessage)
            : this.renderMessagesPanel()
    }
}

const policy = () => ({_: 'disallow'})

const UserMessages = (
    activatable({id: 'userMessages', policy, alwaysAllow: true})(
        connect(mapStateToProps)(_UserMessages)
    )
)

UserMessages.propTypes = {
    className: PropTypes.string
}

const _UserMessagesButton = ({className, userMessages}) => {
    const unread = _.filter(userMessages, {state: 'UNREAD'}).length
    return (
        <React.Fragment>
            <Activator id='userMessages'>
                {({active, activate}) =>
                    <Button
                        chromeless
                        look='transparent'
                        size='large'
                        additionalClassName={[className, unread ? styles.unread : null].join(' ')}
                        icon='bell'
                        disabled={active}
                        onClick={() => activate()}
                        tooltip={msg('home.sections.user.messages')}
                        tooltipPlacement='top'
                        tooltipDisabled={active}/>
                }
            </Activator>
            <UserMessages/>
        </React.Fragment>
    )
}

export const UserMessagesButton = connect(state => ({
    userMessages: state.user.userMessages
}))(_UserMessagesButton)
