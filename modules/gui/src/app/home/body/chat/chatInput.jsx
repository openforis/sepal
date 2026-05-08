import PropTypes from 'prop-types'
import {useCallback, useRef, useState} from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Textarea} from '~/widget/input'

import styles from './chatInput.module.css'

export const ChatInput = ({onSend, disabled}) => {
    const [text, setText] = useState('')
    const textareaRef = useRef(null)

    const handleSend = useCallback(() => {
        const trimmed = text.trim()
        if (trimmed && !disabled) {
            onSend(trimmed)
            setText('')
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto'
            }
        }
    }, [text, disabled, onSend])

    const handleChange = useCallback(e => {
        setText(e.target.value)
    }, [])

    return (
        <div className={styles.inputContainer}>
            <Textarea
                ref={textareaRef}
                className={styles.textarea}
                value={text}
                autoFocus
                onChange={handleChange}
                onEnter={handleSend}
                placeholder={msg('home.chat.placeholder')}
                disabled={disabled}
                minRows={3}
            />
            <Button
                chromeless
                shape='circle'
                icon='paper-plane'
                disabled={disabled || !text.trim()}
                onClick={handleSend}
            />
        </div>
    )
}

ChatInput.propTypes = {
    onSend: PropTypes.func.isRequired,
    disabled: PropTypes.bool
}
