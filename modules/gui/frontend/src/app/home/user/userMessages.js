import {Activator, activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {Msg, msg} from 'translate'
import {NoData} from 'widget/noData'
import {Panel} from 'widget/panel/panel'
import {SuperButton} from 'widget/superButton'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {connect} from 'store'
import {v4 as uuid} from 'uuid'
import Markdown from 'react-markdown'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import UserMessage from './userMessage'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'
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

    updateUserMessage(userMessage) {
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

    readState(read) {
        return read
            ? 'READ'
            : 'UNREAD'
    }

    setReadState(userMessage) {
        this.updateUserMessage({
            ...userMessage,
            state: 'READ'
        })
    }

    toggleReadState(userMessage) {
        const nextState = state => {
            switch(state) {
            case 'READ':
                return 'UNREAD'
            case 'UNREAD':
                return 'READ'
            default:
                throw Error(`Unsupported message state "${state}"`)
            }
        }
        this.updateUserMessage({
            ...userMessage,
            state: nextState(userMessage.state)
        })
    }

    newMessage() {
        this.editMessage({})
    }

    editMessage(userMessage) {
        this.setState({
            selectedMessage: userMessage
        })
    }

    renderMessages() {
        const {userMessages} = this.props
        if (userMessages.length) {
            const sortedUserMessages = _.orderBy(userMessages, userMessage => moment(userMessage.message.creationTime) || moment(), 'desc')
            return (
                sortedUserMessages.map((userMessage, index) => this.renderMessage(userMessage, index))
            )
        } else {
            return (
                <NoData message={msg('userMessages.noMessages')}/>
            )
        }
    }

    renderStatusButton(userMessage) {
        const {state} = userMessage
        return (
            <Button
                key='status'
                chromeless
                shape='circle'
                size='large'
                icon={state === 'UNREAD' ? 'bell' : 'check'}
                additionalClassName={[styles.subject, styles[state]].join(' ')}
                onClick={() => this.toggleReadState(userMessage)}
                tooltip={msg(`userMessages.state.${state}`)}
                tooltipPlacement='top'
            />
        )
    }

    renderMessage(userMessage, index) {
        const {isAdmin} = this.props
        const message = userMessage.message
        const author = userMessage.message.username
        const creationTime = userMessage.message.creationTime
        return (
            <SuperButton
                key={index}
                title={<Msg id='userMessages.author' author={author}/>}
                description={userMessage.message.subject}
                timestamp={creationTime}
                editTooltip={msg('userMessages.edit')}
                removeMessage={msg('userMessages.removeConfirmation', {subject: message.subject})}
                removeTooltip={msg('userMessages.remove')}
                onExpandDelayed={() => this.setReadState(userMessage, 'READ')}
                onEdit={isAdmin ? () => this.editMessage(message) : null}
                onRemove={isAdmin ? () => this.removeMessage(message) : null}
                extraButtons={[
                    this.renderStatusButton(userMessage)
                ]}
                clickToExpand
            >
                <Markdown className={styles.contents} source={userMessage.message.contents}/>
            </SuperButton>
        )
    }

    renderMessagesPanel() {
        const {isAdmin, activatable: {deactivate}} = this.props
        const close = () => deactivate()
        const add = () => this.newMessage()
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='bell'
                    title={msg('userMessages.title')}/>
                <Panel.Content>
                    {this.renderMessages()}
                </Panel.Content>
                <Panel.Buttons onEnter={close} onEscape={close}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={close}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Add
                            label={msg('userMessages.post')}
                            icon='pencil-alt'
                            onClick={add}
                            shown={isAdmin}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
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
        const {userMessages} = this.props
        const {selectedMessage} = this.state
        if (userMessages) {
            return selectedMessage
                ? this.renderMessagePanel(selectedMessage)
                : this.renderMessagesPanel()
        } else {
            return null
        }
    }
}

const policy = () => ({_: 'disallow'})

const UserMessages = compose(
    _UserMessages,
    connect(mapStateToProps),
    activatable({id: 'userMessages', policy, alwaysAllow: true})
)

UserMessages.propTypes = {
    className: PropTypes.string
}

class _UserMessagesButton extends React.Component {
    state = {
        shown: false
    }

    render() {
        const {className, unreadUserMessages} = this.props
        return (
            <React.Fragment>
                <UserMessages/>
                <Activator id='userMessages'>
                    {({active, activate}) =>
                        <Button
                            chromeless
                            look='transparent'
                            size='large'
                            air='less'
                            additionalClassName={[className, unreadUserMessages ? styles.unread : null].join(' ')}
                            icon='bell'
                            disabled={active}
                            onClick={() => activate()}
                            tooltip={msg('home.sections.user.messages')}
                            tooltipPlacement='top'
                            tooltipDisabled={active}/>
                    }
                </Activator>
            </React.Fragment>
        )
    }

    componentDidUpdate() {
        const {unreadUserMessages} = this.props
        const {shown} = this.state
        if (unreadUserMessages && !shown) {
            const {activator: {activatables: {userMessages}}} = this.props
            this.setState({shown: true}, () => userMessages.activate())
        }
    }
}

export const UserMessagesButton = compose(
    _UserMessagesButton,
    connect(state => ({
        unreadUserMessages: _.filter(state.user.userMessages, {state: 'UNREAD'}).length
    })),
    activator('userMessages')
)
