import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {Button} from '~/widget/button'

import styles from './moveNotification.module.css'

// A notification of its own rather than a plain message: what moved is easy to miss, and the way back
// has to be easy to find, so both sit in the middle of the card with room around them.
export const MoveNotification = ({message, onUndo}) =>
    <div className={styles.notification}>
        <div className={styles.message}>{message}</div>
        <div className={styles.hint}>{msg('process.recipeList.undoHint')}</div>
        <Button
            look='highlight'
            shape='pill'
            size='large'
            air='more'
            icon='rotate-left'
            label={msg('process.recipeList.undo')}
            onClick={onUndo}
        />
    </div>

MoveNotification.propTypes = {
    message: PropTypes.string.isRequired,
    onUndo: PropTypes.func.isRequired
}
