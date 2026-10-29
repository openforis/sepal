import PropTypes from 'prop-types'
import {isValidElement, useEffect, useRef} from 'react'

import styles from './errorIndicator.module.css'
import {Icon} from './icon'
import {Tooltip} from './tooltip'
import {isMobile} from './userAgent'

// An error marked as a form's label marks a field's: an icon explaining it on hover and on keyboard focus. Using it
// activates nothing it is placed in. A row is dragged from a press its own listener sees before React would stop it, so
// the press is stopped where it starts; a click is stopped before the row's handler.
export const ErrorIndicator = ({error, severity = 'error'}) => {
    const ref = useRef()
    const messages = [error].flat()
    const interactive = messages.some(isValidElement)
    const text = messages.map(message => isValidElement(message) ? message.props.text : message)
        .filter(message => typeof message === 'string').join(' ')
    useEffect(() => {
        const element = ref.current
        PRESS_EVENTS.forEach(type => element.addEventListener(type, stopPropagation))
        return () => PRESS_EVENTS.forEach(type => element.removeEventListener(type, stopPropagation))
    }, [])
    return (
        <span ref={ref} className={styles.indicator} onClick={stopPropagation}>
            {/* Text keeps its focus explanation. Interactive content opens by click/Enter so focus can move into it. */}
            <Tooltip msg={error} placement='right' delay={0} focusTrigger={!interactive && !isMobile()} clickTrigger>
                <button
                    type='button'
                    className={styles.target}
                    aria-label={text || undefined}
                    data-feedback={severity}
                    onKeyDown={event => {
                        if (['Enter', ' '].includes(event.key)) event.stopPropagation()
                    }}>
                    <Icon name='triangle-exclamation' variant={severity} attributes={{fade: severity === 'error'}}/>
                </button>
            </Tooltip>
        </span>
    )
}

const PRESS_EVENTS = ['pointerdown', 'mousedown', 'touchstart']

const stopPropagation = e => e.stopPropagation()

ErrorIndicator.propTypes = {
    // What is wrong: a message, or several shown as lines of one.
    error: PropTypes.any.isRequired,
    severity: PropTypes.oneOf(['error', 'warning'])
}
