import PropTypes from 'prop-types'
import {useCallback} from 'react'

import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {FastList} from '~/widget/fastList'
import {ListItem} from '~/widget/listItem'
import {Scrollable} from '~/widget/scrollable'
import {Shape} from '~/widget/shape'

import styles from './conversationList.module.css'

export const ConversationList = ({conversations, activeConversationId, onSelect, onRemove}) => {
    const renderConversation = useCallback(conversation => {
        const isActive = conversation.id === activeConversationId
        return (
            <ListItem
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}>
                <CrudItem
                    title={conversation.title || msg('home.chat.conversations.untitled')}
                    icon='comment'
                    iconSize='xl'
                    iconVariant={isActive ? 'info' : 'normal'}
                    timestamp={conversation.updatedAt}
                    removeTooltip={msg('home.chat.conversations.delete')}
                    onRemove={() => onRemove(conversation.id)}
                />
            </ListItem>
        )
    }, [activeConversationId, onSelect, onRemove])

    if (conversations.length === 0) {
        return (
            <div className={styles.empty}>
                <Shape
                    look='transparent'
                    shape='pill'
                    size='normal'
                    air='more'>
                    {msg('home.chat.conversations.empty')}
                </Shape>
            </div>
        )
    }

    return (
        <div className={styles.list}>
            <Scrollable direction='x'>
                <FastList
                    items={conversations}
                    itemKey={conversation => conversation.id}
                    itemRenderer={renderConversation}
                    spacing='tight'
                    overflow={50}
                />
            </Scrollable>
        </div>
    )
}

ConversationList.propTypes = {
    activeConversationId: PropTypes.string,
    conversations: PropTypes.arrayOf(PropTypes.shape({
        createdAt: PropTypes.string,
        id: PropTypes.string.isRequired,
        title: PropTypes.string,
        updatedAt: PropTypes.string
    })).isRequired,
    onRemove: PropTypes.func.isRequired,
    onSelect: PropTypes.func.isRequired
}
