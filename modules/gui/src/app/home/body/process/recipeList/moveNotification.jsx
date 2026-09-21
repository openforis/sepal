import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {Button} from '~/widget/button'

import styles from './moveNotification.module.css'

// The text reads like every other notification; only the way back is centred, so it is easy to aim at.
export const MoveNotification = ({message, onUndo}) =>
    <div className={styles.notification}>
        <div className={styles.message}>{message}</div>
        <div className={styles.hint}>{msg('process.recipeList.undoHint')}</div>
        <div className={styles.undo}>
            <Button
                look='transparent'
                shape='pill'
                size='small'
                icon='rotate-left'
                label={msg('process.recipeList.undo')}
                onClick={onUndo}
            />
        </div>
    </div>

MoveNotification.propTypes = {
    message: PropTypes.string.isRequired,
    onUndo: PropTypes.func.isRequired
}
