// Registry of UserChat keyed by username, lazy-built on first touch.
// Loads the main system prompt once and prepends it to each new
// Conversation's initial messages.

import {map} from 'rxjs'

import {mainSystemPrompt} from '../llmText/prompts.js'
import {createConversation} from './conversation.js'
import {createConversations} from './conversations.js'
import {createGuiContexts} from './guiContexts.js'
import {createMessageHandler} from './messageHandler.js'
import {createPendingActions} from './pendingActions.js'
import {createTitleGenerator} from './titleGenerator.js'
import {createUserChat} from './userChat.js'

function createUserChats({chatStorage, llm, tools, bus, clock, createId, diagnostics}) {
    const chats = new Map()
    const systemMessage = {role: 'system', content: mainSystemPrompt()}

    return {chatFor}

    function chatFor(username) {
        if (!chats.has(username)) chats.set(username, buildChat(username))
        return chats.get(username)
    }

    // pendingActions.answer$ resolves a conversation lazily via the closure
    // over `conversations`, so we can build pendingActions first and pass it
    // straight into createConversations + every conversation factory below.
    function buildChat(username) {
        const conversationsStore = chatStorage.conversationsFor(username)
        const titleGenerator = createTitleGenerator({llm, conversationsStore, bus, diagnostics})
        const pendingActions = createPendingActions({
            conversations: {
                get$: id => conversations.get$(id),
                persistOrTouch$: (id, now) => conversations.persistOrTouch$(id, now)
            },
            createId,
            clock
        })
        const conversations = createConversations({
            conversationsStore,
            conversationFor$: id => buildConversation$(username, id, pendingActions),
            createId,
            clock,
            pendingActions
        })
        const guiContexts = createGuiContexts()
        const messageHandler = createMessageHandler({conversations, guiContexts, titleGenerator, clock})
        return createUserChat({conversations, guiContexts, messageHandler, pendingActions, bus})
    }

    function buildConversation$(username, id, pendingActions) {
        const history = chatStorage.historyFor(username, id)
        return history.load$().pipe(
            map(persistedMessages => createConversation({
                llm, tools, history,
                initialMessages: [systemMessage, ...persistedMessages],
                id,
                bus,
                diagnostics,
                pendingActions
            }))
        )
    }
}

export {createUserChats}
