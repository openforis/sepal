import PropTypes from 'prop-types'
import React from 'react'

import {copyToClipboard} from '~/clipboard'
import {msg} from '~/translate'
import {Button} from '~/widget/button'

import styles from './copyButton.module.css'

const ACKNOWLEDGEMENT_MS = 1000

// A copy control that acknowledges itself. Success used to be announced by a global notification, which said
// nothing the button and the value beside it did not already say; a check on the button says it where the user
// is looking. Failure stays global, because a refused write leaves nothing on screen to notice.
//
// Everything about the button's appearance is the caller's, forwarded untouched, except while acknowledged.
//
// Two things can invalidate an in-flight write: another click, and a new value. Both bump `copyId`, so only the
// newest write may acknowledge - a slow first write resolving after a second click, or after the value changed
// beneath it, is ignored rather than confirming something that is no longer true.
class _CopyButton extends React.Component {
    copyId = 0
    timeout = null

    state = {acknowledged: false}

    constructor(props) {
        super(props)
        this.copy = this.copy.bind(this)
    }

    render() {
        const {value: _value, failureMessage: _failureMessage, ...buttonProps} = this.props
        const {acknowledged} = this.state
        return (
            <React.Fragment>
                <Button
                    {...buttonProps}
                    {...acknowledged
                        ? {
                            icon: 'circle-check',
                            iconType: 'solid',
                            iconVariant: 'success',
                            tooltip: msg('clipboard.copy.success'),
                            // Shown at once rather than on hover: the acknowledgement is over in a second, and
                            // the pointer is already on the button that produced it.
                            tooltipVisible: true,
                            tooltipDelay: 0
                        }
                        : {}}
                    onClick={this.copy}
                />
                <span className={styles.status} role='status'>
                    {acknowledged ? msg('clipboard.copy.success') : ''}
                </span>
            </React.Fragment>
        )
    }

    componentDidUpdate({value: previousValue}) {
        if (previousValue !== this.props.value) {
            this.reset()
        }
    }

    componentWillUnmount() {
        this.copyId++
        this.clearTimeout()
    }

    copy() {
        const {value, failureMessage} = this.props
        this.reset()
        const copyId = this.copyId
        copyToClipboard(value, {failureMessage}).then(
            success => success && copyId === this.copyId && this.acknowledge()
        )
    }

    // Any pending timer was already cleared by the reset() every copy starts with.
    acknowledge() {
        this.setState({acknowledged: true})
        this.timeout = setTimeout(() => {
            this.timeout = null
            this.setState({acknowledged: false})
        }, ACKNOWLEDGEMENT_MS)
    }

    // Invalidates the pending write as well as the visible acknowledgement: both are about a value that is no
    // longer the one in hand.
    reset() {
        this.copyId++
        this.clearTimeout()
        if (this.state.acknowledged) {
            this.setState({acknowledged: false})
        }
    }

    clearTimeout() {
        if (this.timeout) {
            clearTimeout(this.timeout)
            this.timeout = null
        }
    }
}

export const CopyButton = _CopyButton

CopyButton.propTypes = {
    // Optional: a control can be disabled precisely because it has nothing to copy yet.
    value: PropTypes.any,
    failureMessage: PropTypes.string
}
