import PropTypes from 'prop-types'

import styles from './sessionName.module.css'

// How every surface shows a session ("humble-robin" on a "t1"): the identity the session list, the
// instance picker, the stop confirmations and the expiry notification share, so a user recognises
// the same machine wherever it is mentioned. Inline, so it can sit inside a sentence. A session
// predating names shows its type alone.
export const SessionName = ({name, type}) =>
    <span className={styles.sessionName}>
        {name ? <span className={styles.name}>{name}</span> : null}
        {type ? <span className={styles.type}>{type}</span> : null}
    </span>

// The tag as plain text, for a message copied to the clipboard.
SessionName.text = ({name, type}) =>
    [name, type].filter(Boolean).join(' ')

SessionName.propTypes = {
    name: PropTypes.string,
    type: PropTypes.string
}
