import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Notifications} from '~/widget/notifications'

import styles from './moveNotification.module.css'

const UNDO_TIMEOUT_SECONDS = 15

export const offerMoveUndo = (message, undo) =>
    Notifications.info({
        timeout: UNDO_TIMEOUT_SECONDS,
        content: dismiss =>
            <MoveNotification
                message={message}
                onUndo={() => {
                    undo()
                    dismiss()
                }}
            />
    })

// The text reads like every other notification; the way back spans it, so it is easy to aim at.
export const MoveNotification = ({message, onUndo}) =>
    <div className={styles.notification}>
        <div>{message}</div>
        <div className={styles.hint}>{msg('process.recipeList.undoHint')}</div>
        <Button
            look='cancel'
            shape='pill'
            size='small'
            width='max'
            additionalClassName={styles.undo}
            icon='rotate-left'
            label={msg('process.recipeList.undo')}
            onClick={onUndo}
        />
    </div>

MoveNotification.propTypes = {
    message: PropTypes.string.isRequired,
    onUndo: PropTypes.func.isRequired
}
