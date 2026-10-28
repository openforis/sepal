import {format, formatDistanceToNowStrict} from 'date-fns'
import PropTypes from 'prop-types'
import {useEffect, useReducer} from 'react'
import {distinctUntilChanged, interval, map, share, skip, startWith} from 'rxjs'

import {Tooltip} from '~/widget/tooltip'

import styles from './relativeTime.module.css'

// One clock for every relative time on screen, running only while one is mounted. Each re-renders
// only when its own text changes, so a list of old items costs a string comparison a second.
const tick$ = interval(1000).pipe(share())

export const RelativeTime = ({timestamp, tooltipPlacement}) => {
    const [, rerender] = useReducer(count => count + 1, 0)

    useEffect(() => {
        const subscription = tick$.pipe(
            map(() => relativeTime(timestamp)),
            startWith(relativeTime(timestamp)),
            distinctUntilChanged(),
            skip(1)
        ).subscribe(rerender)
        return () => subscription.unsubscribe()
    }, [timestamp])

    return (
        <Tooltip msg={format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss')} placement={tooltipPlacement}>
            <div className={styles.relativeTime}>
                {relativeTime(timestamp)}
            </div>
        </Tooltip>
    )
}

const relativeTime = timestamp =>
    formatDistanceToNowStrict(new Date(timestamp), {addSuffix: true})

RelativeTime.propTypes = {
    timestamp: PropTypes.any.isRequired,
    tooltipPlacement: PropTypes.string
}
