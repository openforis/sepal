import PropTypes from 'prop-types'
import {useSelector} from 'react-redux'

import {select} from '~/store'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Layout} from '~/widget/layout'
import {RemoveButton} from '~/widget/removeButton'

import {ChatInput} from './chatInput'
import {closeChat, getChatMode, isChatOpen, isSplitMode, toggleChatMode, useChatResize} from './chatLayout'
import {ChatMessages} from './chatMessages'
import styles from './chatPanel.module.css'
import {ConversationList} from './conversationList'
import {useChatCommands} from './useChatCommands'
import {useChatContextSync} from './useChatContextSync'
import {useChatMessageDispatch} from './useChatMessageDispatch'
import {useChatWebSocket} from './useChatWebSocket'
import {useConversation} from './useConversation'

export const ChatPanel = ({className}) => {
    const isOpen = useSelector(() => isChatOpen())
    const mode = useSelector(() => getChatMode())
    const isSplit = isSplitMode(mode)
    const handleResizeStart = useChatResize()

    const {isConnected, send, respond, message$} = useChatWebSocket()
    const [state, dispatch] = useConversation()
    const {messages, isLoading, isThinking, view, conversations, activeConversationId} = state

    // Subscribe so the panel re-renders when the formatter lazy-loads recipes/projects
    useSelector(() => select('process.recipes'))
    useSelector(() => select('process.projects'))

    useChatContextSync({isConnected, send})
    useChatMessageDispatch({message$, dispatch, respond})
    const {
        handleSend,
        handleStop,
        handleNewConversation,
        handleSelectConversation,
        handleDeleteConversation,
        handleDeleteActiveConversation,
        handleDeleteAllConversations,
        handleShowList
    } = useChatCommands({isConnected, activeConversationId, send, dispatch})

    const isConversation = view === 'chat' && activeConversationId
    const activeConversation = isConversation
        ? conversations.find(c => c.id === activeConversationId)
        : null
    const headerTitle = activeConversation?.title || msg('home.chat.title')

    const renderConversationToolbar = () => (
        <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
            <Button
                chromeless
                shape='circle'
                icon={'arrow-left'}
                tooltip={msg(view === 'chat' ? 'home.chat.showConversations' : 'home.chat.showChat')}
                tooltipPlacement='bottom'
                onClick={handleShowList}
            />
            <RemoveButton
                chromeless
                shape='circle'
                icon='trash'
                tooltip={msg('home.chat.deleteConversation')}
                tooltipPlacement='bottom'
                disabled={!isConnected || isLoading}
                onRemove={handleDeleteActiveConversation}
            />
        </ButtonGroup>
    )

    const renderConversationListToolbar = () => (
        <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
            <Button
                chromeless
                shape='circle'
                icon='plus'
                tooltip={msg('home.chat.newConversation')}
                tooltipPlacement='bottom'
                disabled={!isConnected || (activeConversationId && messages.length === 0)}
                onClick={handleNewConversation}
            />
            <RemoveButton
                chromeless
                shape='circle'
                icon='trash'
                tooltip={msg('home.chat.deleteAllConversations.tooltip')}
                tooltipPlacement='bottom'
                disabled={!isConnected || isLoading}
                title={msg('home.chat.deleteAllConversations.title')}
                message={msg('home.chat.deleteAllConversations.message')}
                noClickHold
                onRemove={handleDeleteAllConversations}
            />
        </ButtonGroup>
    )

    const renderPanelToolbar = () => (
        <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
            <Button
                chromeless
                shape='circle'
                icon={isSplit ? 'thumbtack-slash' : 'thumbtack'}
                tooltip={msg(isSplit ? 'home.chat.floating' : 'home.chat.sticky')}
                tooltipPlacement='bottom'
                onClick={toggleChatMode}
            />
            <Button
                chromeless
                shape='circle'
                icon='times'
                tooltip={msg('home.chat.close')}
                tooltipPlacement='bottomRight'
                onClick={closeChat}
            />
        </ButtonGroup>
    )

    const renderHeader = () => (
        <Layout className={styles.header} type='horizontal-nowrap'>
            {isConversation ? renderConversationToolbar() : renderConversationListToolbar()}
            <span className={styles.title} title={headerTitle}>{headerTitle}</span>
            {renderPanelToolbar()}
        </Layout>
    )

    const renderConversationList = () => (
        <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={handleSelectConversation}
            onRemove={handleDeleteConversation}
        />
    )

    const renderConversation = () => (
        <>
            <ChatMessages messages={messages} thinking={isThinking} isLoading={isLoading}/>
            <ChatInput
                key={activeConversationId}
                onSend={handleSend}
                onStop={handleStop}
                busy={isLoading}
                disabled={!isConnected || !activeConversationId}
                sendDisabled={isLoading}
            />
        </>
    )

    return isOpen ? (
        <div className={[
            isSplit ? styles.split : styles.panel,
            className
        ].join(' ')}>
            {isSplit ? (
                <div
                    className={styles.resizeHandle}
                    onPointerDown={handleResizeStart}
                />
            ) : null}
            {renderHeader()}
            {isConversation ? renderConversation() : renderConversationList()}
        </div>
    ) : null
}

ChatPanel.propTypes = {
    className: PropTypes.string
}
