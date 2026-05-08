import PropTypes from 'prop-types'
import {useCallback, useEffect, useRef, useState} from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'

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

    const handleKeyDown = useCallback(e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }, [handleSend])

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [])

    useEffect(() => {
        if (!disabled && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [disabled])

    const handleChange = useCallback(e => {
        setText(e.target.value)
        const textarea = e.target
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`
    }, [])

    return (
        <div className={styles.inputContainer}>
            <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={msg('home.chat.placeholder')}
                disabled={disabled}
                rows={1}
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
