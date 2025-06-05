import _ from 'lodash'
import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {Msg, msg} from '~/translate'
import {currentUser} from '~/user'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Markdown} from '~/widget/markdown'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {UserMessage} from './userMessage'
import styles from './userMessages.module.css'

const mapStateToProps = state => {
    const currentUser = state.user.currentUser
    const userMessages = state.user.userMessages
    return {
        isAdmin: currentUser.roles && currentUser.roles.includes('application_admin'),
        userMessages
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

const unreadMessagesCount = userMessages =>
    _.filter(userMessages, {state: 'UNREAD'}).length

class _UserMessages extends React.Component {
    state = {
        selectedMessage: null
    }

    constructor(props) {
        super(props)
        this.newMessage = this.newMessage.bind(this)
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

    isUnread() {
        const {userMessages} = this.props
        return unreadMessagesCount(userMessages)
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
                <Layout type='vertical' spacing='tight'>
                    {sortedUserMessages.map((userMessage, index) => this.renderMessage(userMessage, index))}
                </Layout>
            )
        } else {
            return (
                <NoData message={msg('userMessages.noMessages')}/>
            )
        }
    }

    renderStatusButton(userMessage) {
        const {state} = userMessage
        const unread = state === 'UNREAD'
        return (
            <Button
                key='status'
                chromeless
                shape='circle'
                size='large'
                icon={unread ? 'bell' : 'check'}
                iconAttributes={{fade: unread}}
                tooltip={msg(`userMessages.state.${state}`)}
                tooltipPlacement='top'
                onClick={() => this.toggleReadState(userMessage)}
            />
        )
    }

    renderMessage(userMessage, index) {
        const {isAdmin} = this.props
        const message = userMessage.message
        const author = userMessage.message.username
        const creationTime = userMessage.message.creationTime
        return (
            <ListItem
                key={index}
                expansion={this.renderMessageBody(userMessage.message.contents)}
                clickToToggle
                onExpandDelayed={() => this.setReadState(userMessage, 'READ')}>
                <CrudItem
                    title={<Msg id='userMessages.author' author={author}/>}
                    description={userMessage.message.subject}
                    timestamp={creationTime}
                    editTooltip={msg('userMessages.edit')}
                    removeTooltip={msg('userMessages.remove')}
                    onEdit={isAdmin ? () => this.editMessage(message) : null}
                    onRemove={isAdmin ? () => this.removeMessage(message) : null}
                    inlineComponents={[
                        this.renderStatusButton(userMessage)
                    ]}
                />
            </ListItem>
        )
    }

    renderMessageBody(contents) {
        return (
            <Markdown className={styles.contents} source={contents}/>
        )
    }

    renderMessagesPanel() {
        const {isAdmin, activatable: {deactivate}} = this.props
        const isClosable = !this.isUnread() || isAdmin
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
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Enter', 'Escape']}
                            disabled={!isClosable}
                            onClick={deactivate}
                        />
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Add
                            label={msg('userMessages.post')}
                            icon='pencil-alt'
                            onClick={this.newMessage}
                            hidden={!isAdmin}/>
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
    withActivatable({id: 'userMessages', policy, alwaysAllow: true})
)

UserMessages.propTypes = {
    className: PropTypes.string
}

class _UserMessagesButton extends React.Component {
    state = {
        shown: false
    }

    render() {
        return (
            <React.Fragment>
                <UserMessages/>
                {this.renderButton()}
            </React.Fragment>
        )
    }

    renderButton() {
        const {unreadUserMessages, activator: {activatables: {userMessages: {active, activate}}}} = this.props
        return (
            <Button
                chromeless
                look='transparent'
                size='large'
                air='less'
                icon='bell'
                iconAttributes={{fade: unreadUserMessages > 0}}
                disabled={active}
                tooltip={msg('home.sections.user.messages')}
                tooltipPlacement='top'
                tooltipDisabled={active}
                onClick={activate}
            />
        )
    }

    componentDidUpdate() {
        const {user, unreadUserMessages, activator: {activatables: {userMessages}}} = this.props
        const {shown} = this.state
        if (user.privacyPolicyAccepted && unreadUserMessages && !shown && userMessages.canActivate) {
            userMessages.activate()
            this.setState({shown: true})
        }
    }
}

export const UserMessagesButton = compose(
    _UserMessagesButton,
    connect(state => ({
        user: currentUser(),
        unreadUserMessages: unreadMessagesCount(state.user.userMessages)
    })),
    withActivators('userMessages')
)
