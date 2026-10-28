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
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Markdown} from '~/widget/markdown'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {EditMessage, ShowMessage} from './message'
import styles from './messages.module.css'

const isAdmin = user =>
    user.roles && user.roles.includes('application_admin')

const mapStateToProps = state => {
    const currentUser = state.user.currentUser
    const messages = state.user.messages
    return {
        isAdmin: isAdmin(currentUser),
        username: currentUser.username,
        messages,
        urgentMode: !!(state.ui && state.ui.messagesUrgent)
    }
}

// Urgent auto-open mode: the 10s timer (see MessagesButton) sets this flag before activating,
// making the modal show the unread urgent messages THEMSELVES, one after the other, instead of the
// message list. Cleared when the last one is closed.
export const showUrgentMessages = () =>
    actionBuilder('SHOW_URGENT_MESSAGES')
        .set('ui.messagesUrgent', true)
        .dispatch()

const endUrgentMessages = () =>
    actionBuilder('END_URGENT_MESSAGES')
        .del('ui.messagesUrgent')
        .dispatch()

export const showMessages = () =>
    actionBuilder('MESSAGES')
        .set('ui.messages', 'SHOW_MESSAGES')
        .dispatch()

export const closePanel = () =>
    actionBuilder('MESSAGES')
        .del('ui.messages')
        .dispatch()

const unreadMessagesCount = messages =>
    messages
        ? messages.filter(message => message.state === 'UNREAD').length
        : 0

const unreadUrgentMessagesCount = messages =>
    messages
        ? messages.filter(message => message.state === 'UNREAD' && message.message.priority > 0).length
        : 0

class _Messages extends React.Component {
    state = {
        editMessage: null,
        showMessage: null,
        shownUrgentIds: []
    }

    constructor(props) {
        super(props)
        this.newMessage = this.newMessage.bind(this)
    }

    // Next unread urgent message not yet shown in this cascade. The shownUrgentIds guard covers
    // the window where the read-state POST (and a concurrent ws snapshot) hasn't landed yet, so a
    // just-closed message cannot re-appear.
    nextUrgentMessage() {
        const {messages} = this.props
        const {shownUrgentIds} = this.state
        return _.find(messages, message =>
            message.state === 'UNREAD'
                && message.message.priority > 0
                && !shownUrgentIds.includes(message.message.id)
        )
    }

    // Acknowledgment happens inside ShowMessage on close; this only advances the cascade.
    advanceUrgentCascade(message) {
        const id = message.message.id
        this.setState(({shownUrgentIds}) => ({shownUrgentIds: [...shownUrgentIds, id]}))
    }

    // When the cascade runs dry, leave urgent mode and close the modal without showing the list.
    checkUrgentDone() {
        const {urgentMode, activatable: {deactivate}} = this.props
        const {editMessage, showMessage} = this.state
        if (urgentMode && !editMessage && !showMessage && !this.nextUrgentMessage()) {
            endUrgentMessages()
            deactivate()
        }
    }

    componentDidMount() {
        this.checkUrgentDone()
    }

    componentDidUpdate() {
        this.checkUrgentDone()
    }

    componentWillUnmount() {
        const {urgentMode} = this.props
        urgentMode && endUrgentMessages()
    }

    updateMessage(message) {
        const {id = uuid()} = message
        this.props.stream('REQUEST_UPDATE_MESSAGE',
            api.message.update$({...message, id}),
            saved => {
                // The author has read their own message — the backend marks it READ for them too.
                actionBuilder('UPDATE_MESSAGE')
                    .assign(['user.messages', {message: {id}}], {message: saved, state: 'READ'})
                    .dispatch()
                Notifications.success({
                    message: msg(saved.priority < 0
                        ? 'message.update.unpublished.success'
                        : 'message.update.published.success')
                })
            },
            error => Notifications.error({message: msg('message.update.error'), error})
        )
        this.closeMessage()
    }

    removeMessage(message) {
        const {id} = message
        this.props.stream('REQUEST_REMOVE_MESSAGE',
            api.message.remove$(message),
            () => {
                actionBuilder('REMOVE_MESSAGE')
                    .del(['user.messages', {message: {id}}])
                    .dispatch()
            },
            error => Notifications.error({message: msg('message.remove.error'), error})
        )
    }

    updateMessageState(message) {
        const id = message.message.id
        const state = message.state
        this.props.stream('REQUEST_UPDATE_MESSAGE_STATE',
            api.message.updateState$(message),
            () => {
                actionBuilder('UPDATE_MESSAGE_STATE', {id, state})
                    .assign(['user.messages', {message: {id}}], {state})
                    .dispatch()
            },
            error => Notifications.error({message: msg('message.updateState.error'), error})
        )
    }

    buttonHandler() {
        const {modal} = this.props
        !modal && showMessages()
    }

    readState(read) {
        return read
            ? 'READ'
            : 'UNREAD'
    }

    toggleReadState(message) {
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
        this.updateMessageState({
            ...message,
            state: nextState(message.state)
        })
    }

    isUnread() {
        const {messages} = this.props
        return unreadMessagesCount(messages) > 0
    }

    newMessage() {
        this.editMessage({})
    }

    editMessage(message) {
        this.setState({
            editMessage: message
        })
    }

    showMessage(message) {
        this.setState({
            showMessage: message
        })
    }

    closeMessage() {
        this.setState({
            editMessage: null,
            showMessage: null
        })
    }

    renderMessages() {
        const {messages} = this.props
        if (messages.length) {
            const sortedMessages = _.orderBy(messages, message => moment(message.message.updateTime) || moment(), 'desc')
            return (
                <Layout type='vertical' spacing='tight'>
                    {sortedMessages.map(message => this.renderMessage(message))}
                </Layout>
            )
        } else {
            return (
                <NoData message={msg('messages.noMessages')}/>
            )
        }
    }

    renderStatusIcon(message) {
        const {state} = message
        const unread = state === 'UNREAD'
        return (
            <Icon
                key='status'
                chromeless
                shape='circle'
                size='large'
                name={unread ? 'bell' : 'check'}
                attributes={{fade: unread}}
            />
        )
    }

    renderMessage(message) {
        const {isAdmin, username} = this.props
        const {message: {username: author, subject, creationTime, updateTime, priority}, state} = message
        const id = `${author}-${creationTime}-${updateTime}`
        const own = author === username
        const unread = state === 'UNREAD'
        const unreadPriority = unread && priority > 0
        const unpublished = priority < 0
        return (
            <ListItem
                key={id}
                onClick={() => this.setState({showMessage: message})}>
                <CrudItem
                    icon={unpublished ? 'eye-slash' : own ? 'user' : unread ? 'bell' : 'check'}
                    iconAttributes={own || unpublished ? null : unreadPriority ? {buzz: true} : unread ? {fade: true} : null}
                    iconVariant={own || unpublished ? 'default' : unreadPriority ? 'warning' : unread ? 'info' : 'success'}
                    title={<Msg id='messages.author' author={author}/>}
                    description={subject}
                    timestamp={updateTime}
                    editTooltip={msg('messages.edit')}
                    removeTooltip={msg('messages.remove')}
                    onEdit={isAdmin ? () => this.editMessage(message.message) : null}
                    onRemove={isAdmin ? () => this.removeMessage(message.message) : null}
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
                placement='modal'
                onBackdropClick={() => isClosable ? deactivate() : null}>
                <Panel.Header
                    icon='bell'
                    title={msg('messages.title')}/>
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
                            label={msg('messages.post')}
                            icon='pencil-alt'
                            onClick={this.newMessage}
                            hidden={!isAdmin}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderMessagePanel(message, edit) {
        const {isAdmin} = this.props
        return edit ? (
            <EditMessage
                message={message}
                onApply={message => this.updateMessage(message)}
                onCancel={() => this.closeMessage()}
            />
        ) : (
            <ShowMessage
                message={message}
                isAdmin={isAdmin}
                onClose={() => this.closeMessage()}
            />
        )
    }

    renderUrgentMessage() {
        const {isAdmin} = this.props
        const message = this.nextUrgentMessage()
        return message ? (
            <ShowMessage
                message={message}
                isAdmin={isAdmin}
                important={true}
                onClose={() => this.advanceUrgentCascade(message)}
            />
        ) : null // checkUrgentDone deactivates right after
    }

    render() {
        const {messages, urgentMode} = this.props
        const {editMessage, showMessage} = this.state
        if (messages) {
            if (editMessage) return this.renderMessagePanel(editMessage, true)
            if (showMessage) return this.renderMessagePanel(showMessage, false)
            if (urgentMode) return this.renderUrgentMessage()
            return this.renderMessagesPanel()
        } else {
            return null
        }
    }
}

const policy = () => ({_: 'disallow'})

const Messages = compose(
    _Messages,
    connect(mapStateToProps),
    withActivatable({id: 'messages', policy, alwaysAllow: true})
)

Messages.propTypes = {
    className: PropTypes.string
}

const URGENT_AUTO_OPEN_DELAY_MS = 10000

class _MessagesButton extends React.Component {
    state = {
        shown: false
    }

    urgentTimeout = null
    urgentHandled = false
    initialUnread = null

    render() {
        return (
            <React.Fragment>
                <Messages/>
                {this.renderButton()}
            </React.Fragment>
        )
    }

    renderButton() {
        const {unreadMessages, unreadUrgentMessages, activator: {activatables: {messages: {active, activate}}}} = this.props
        const unread = unreadMessages > 0
        const unreadUrgent = unreadUrgentMessages > 0
        return (
            <Button
                chromeless
                look='transparent'
                size='large'
                air='less'
                icon='bell'
                iconAttributes={unreadUrgent ? {buzz: true} : unread ? {fade: true} : null}
                iconVariant={unreadUrgent ? 'warning' : unread ? 'info' : 'default'}
                disabled={active}
                tooltip={msg('home.sections.user.messages')}
                tooltipPlacement='top'
                tooltipDisabled={active}
                onClick={activate}
            />
        )
    }

    componentDidUpdate() {
        const {user, messages, unreadMessages, unreadUrgentMessages, activator: {activatables: {messages: activatable}}} = this.props
        const {shown} = this.state
        // Latch whether there were unread messages when the list FIRST arrived: non-urgent
        // messages only auto-open the modal "at the next reload" — a live-arriving non-urgent
        // message must not open it (urgent ones do, through handleUrgent's delayed open).
        if (messages && this.initialUnread === null) {
            this.initialUnread = unreadMessages > 0
        }
        if (this.initialUnread && !shown && user.privacyPolicyAccepted && activatable.canActivate) {
            if (unreadUrgentMessages > 0) {
                // Urgent messages pending at mount open DIRECTLY, one after the other — not the
                // list, and without the 10s delay reserved for live arrivals.
                this.urgentHandled = true
                showUrgentMessages()
                activatable.activate()
                this.setState({shown: true})
            } else if (unreadMessages > 0 && !isAdmin(user)) {
                activatable.activate()
                this.setState({shown: true})
            }
        }
        this.handleUrgent()
    }

    // An urgent message auto-opens the modal after a delay, unless the user opens it themselves
    // first. Handled once per batch of unread urgent messages: the flag resets when they are all
    // read, so a later urgent message triggers the flow again.
    handleUrgent() {
        const {unreadUrgentMessages, activator: {activatables: {messages}}} = this.props
        if (unreadUrgentMessages === 0) {
            this.cancelUrgentTimeout()
            this.urgentHandled = false
        } else if (messages.active) {
            this.cancelUrgentTimeout()
            this.urgentHandled = true
        } else if (!this.urgentHandled && !this.urgentTimeout) {
            this.urgentTimeout = setTimeout(() => {
                this.urgentTimeout = null
                this.urgentHandled = true
                const {user, unreadUrgentMessages, activator: {activatables: {messages}}} = this.props
                if (user.privacyPolicyAccepted && unreadUrgentMessages > 0 && !messages.active && messages.canActivate) {
                    showUrgentMessages()
                    messages.activate()
                }
            }, URGENT_AUTO_OPEN_DELAY_MS)
        }
    }

    cancelUrgentTimeout() {
        if (this.urgentTimeout) {
            clearTimeout(this.urgentTimeout)
            this.urgentTimeout = null
        }
    }

    componentWillUnmount() {
        this.cancelUrgentTimeout()
    }
}

export const MessagesButton = compose(
    _MessagesButton,
    connect(state => ({
        user: currentUser(),
        messages: state.user.messages,
        unreadMessages: unreadMessagesCount(state.user.messages),
        unreadUrgentMessages: unreadUrgentMessagesCount(state.user.messages)
    })),
    withActivators('messages')
)
