import PropTypes from 'prop-types'
import {useEffect, useRef} from 'react'

import styles from './errorIndicator.module.css'
import {Icon} from './icon'
import {Tooltip} from './tooltip'

// An error marked as a form's label marks a field's: an icon explaining it on hover and on keyboard focus. Using it
// activates nothing it is placed in. A row is dragged from a press its own listener sees before React would stop it, so
// the press is stopped where it starts; a click is stopped before the row's handler.
export const ErrorIndicator = ({error}) => {
    const ref = useRef()
    useEffect(() => {
        const element = ref.current
        PRESS_EVENTS.forEach(type => element.addEventListener(type, stopPropagation))
        return () => PRESS_EVENTS.forEach(type => element.removeEventListener(type, stopPropagation))
    }, [])
    return (
        <span ref={ref} className={styles.indicator} onClick={stopPropagation}>
            <Tooltip msg={error} placement='right' delay={0} focusTrigger>
                <span
                    className={styles.target}
                    tabIndex={0}
                    role='img'
                    aria-label={[error].flat().filter(message => typeof message === 'string').join(' ') || undefined}
                    data-feedback='error'>
                    <Icon name='triangle-exclamation' variant='error' attributes={{fade: true}}/>
                </span>
            </Tooltip>
        </span>
    )
}

const PRESS_EVENTS = ['pointerdown', 'mousedown', 'touchstart']

const stopPropagation = e => e.stopPropagation()

ErrorIndicator.propTypes = {
    // What is wrong: a message, or several shown as lines of one.
    error: PropTypes.any.isRequired
}
