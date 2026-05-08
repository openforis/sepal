import PropTypes from 'prop-types'
import {useLayoutEffect, useMemo, useRef} from 'react'

import {msg} from '~/translate'

import {ChatMessage, ThinkingIndicator} from './chatMessage'
import styles from './chatMessages.module.css'

// Compute display info for tool bubbles. A tool bubble represents one logical
// tool call across the LLM's internal retry attempts, not each round-trip.
// Scope:
//   - One "turn" = the assistant's response to a single user message.
//   - Within a turn, group calls of the same tool name into chains. A chain
//     ends at a success (or at end-of-turn).
//   - Only the LAST call in each chain is shown; earlier calls are retries
//     superseded by later attempts.
//   - While the current user turn is still in progress, an unresolved chain
//     ending in failure renders as a spinner (the LLM may still retry). Only
//     once the turn ends does an unresolved-chain failure become terminal.
// Returns:
//   - hidden: Set of tool ids to drop from rendering entirely.
//   - statusOverride: Map from tool id to a different status to display
//     (used to keep the bubble as 'running' when a chain's last attempt
//     failed but the turn isn't finished yet).
const computeToolDisplay = (messages, isLoading) => {
    const hidden = new Set()
    const statusOverride = new Map()
    const segments = []
    let segmentStart = 0
    messages.forEach((m, i) => {
        if (m.role === 'user' && i > segmentStart) {
            segments.push(messages.slice(segmentStart, i))
            segmentStart = i
        }
    })
    segments.push(messages.slice(segmentStart))
    segments.forEach((segment, segmentIdx) => {
        const inProgress = isLoading && segmentIdx === segments.length - 1
        const callsByName = {}
        for (const m of segment) {
            for (const t of (m.tools || [])) {
                (callsByName[t.name] = callsByName[t.name] || []).push(t)
            }
        }
        for (const calls of Object.values(callsByName)) {
            let chain = []
            for (const c of calls) {
                chain.push(c)
                if (c.status === 'success') {
                    for (let j = 0; j < chain.length - 1; j++) {
                        if (chain[j].id) hidden.add(chain[j].id)
                    }
                    chain = []
                }
            }
            // Open chain (no success at end). Hide all but the last attempt
            // and, if the turn is still ongoing and that last attempt failed,
            // keep its bubble as a spinner — it might be retried.
            for (let j = 0; j < chain.length - 1; j++) {
                if (chain[j].id) hidden.add(chain[j].id)
            }
            if (chain.length > 0) {
                const last = chain[chain.length - 1]
                if (inProgress && last.status === 'error' && last.id) {
                    statusOverride.set(last.id, 'running')
                }
            }
        }
    })
    return {hidden, statusOverride}
}

const SCROLL_BOTTOM_THRESHOLD = 5

export const ChatMessages = ({messages, thinking, isLoading}) => {
    const containerRef = useRef(null)
    const endRef = useRef(null)
    const prevScrollHeightRef = useRef(0)

    useLayoutEffect(() => {
        const el = containerRef.current
        if (!el) return
        const wasAtBottom = el.scrollTop + el.clientHeight >= prevScrollHeightRef.current - SCROLL_BOTTOM_THRESHOLD
        if (wasAtBottom) {
            endRef.current?.scrollIntoView()
        }
        prevScrollHeightRef.current = el.scrollHeight
    }, [messages, thinking])

    const {hidden, statusOverride} = useMemo(
        () => computeToolDisplay(messages, isLoading),
        [messages, isLoading]
    )

    return (
        <div ref={containerRef} className={styles.messages}>
            {messages.length === 0 && !thinking
                ? <div className={styles.empty}>{msg('home.chat.empty')}</div>
                : messages.map((m, i) => (
                    <ChatMessage
                        key={i}
                        role={m.role}
                        content={m.content}
                        tools={m.tools}
                        hiddenToolIds={hidden}
                        statusOverride={statusOverride}
                    />
                ))
            }
            {thinking && <ThinkingIndicator/>}
            <div ref={endRef}/>
        </div>
    )
}

ChatMessages.propTypes = {
    isLoading: PropTypes.bool,
    messages: PropTypes.arrayOf(
        PropTypes.shape({
            role: PropTypes.string.isRequired
        })
    ).isRequired,
    thinking: PropTypes.bool
}
