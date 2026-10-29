import React from 'react'

import {openRecipeById$} from '~/app/home/body/process/recipe'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg, richMsg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {feedbackText} from './feedbackMessage'
import styles from './feedbackMessage.module.css'

const RecipeLink = compose(
    ({reference, stream}) => <button
        type='button'
        className={styles.recipeLink}
        disabled={stream('OPEN_RECIPE').active}
        onKeyDown={event => {
            if (['Enter', ' '].includes(event.key)) event.stopPropagation()
        }}
        onClick={event => {
            event.stopPropagation()
            stream('OPEN_RECIPE', openRecipeById$(reference.recipeId), null,
                error => Notifications.error({message: msg('widget.recipeInput.loadError'), error}))
        }}>
        {reference.name}
    </button>,
    connect()
)

const renderMessage = value => {
    if (value?.recipeId) return <RecipeLink reference={value}/>
    if (value?.parts) return value.parts.map((part, index) => <React.Fragment key={index}>
        {index ? value.separator : null}{renderMessage(part)}
    </React.Fragment>)
    if (value?.key && value.values) return richMsg(value.key, Object.fromEntries(Object.entries(value.values).map(([key, value]) => [key, renderMessage(value)])))
    return value
}

const FeedbackMessage = ({content}) => renderMessage(content)

export const feedbackContent = ({message, messageContent}) => messageContent
    ? <FeedbackMessage content={messageContent} text={message}/>
    : message

// Composition at a UI boundary, after other feedback has already been rendered. Ordinary text keeps its old shape.
export const joinFeedbackContent = messages => messages.every(message => typeof message === 'string')
    ? messages.join(' ')
    : <FeedbackMessage content={{parts: messages, separator: ' '}} text={messages.map(message =>
        React.isValidElement(message) ? message.props.text : feedbackText(message)).join(' ')}/>
