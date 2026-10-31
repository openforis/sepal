import PropTypes from 'prop-types'
import {useLayoutEffect, useRef} from 'react'

import {msg} from '~/translate'
import {Icon} from '~/widget/icon'
import {Portal} from '~/widget/portal'

import styles from './dragPreview.module.css'

const GAP = 20
const MARGIN = 8

export const DragPreview = props => (
    <Portal type='global'>
        <DragBadge {...props}/>
    </Portal>
)

const DragBadge = ({coords, name, icon, count, destination}) => {
    const badge = useRef()
    const label = count > 1 ? msg('process.recipeList.drag.items', {count}) : name

    useLayoutEffect(() => {
        const element = badge.current
        if (element) {
            const {width, height} = element.getBoundingClientRect()
            const place = (pointer, size, available) => Math.max(MARGIN, Math.min(
                pointer + GAP + size <= available - MARGIN ? pointer + GAP : pointer - GAP - size,
                available - MARGIN - size
            ))
            element.style.left = `${place(coords.x, width, window.innerWidth)}px`
            element.style.top = `${place(coords.y, height, window.innerHeight)}px`
        }
    }, [coords, label, destination])

    return (
        <div ref={badge} className={[styles.preview, destination ? styles.valid : null].filter(Boolean).join(' ')} role='status'>
            <Icon name={count > 1 ? 'layer-group' : icon}/>
            <div className={styles.labels}>
                <div className={styles.name}>{label}</div>
                <div className={styles.destination}>
                    {destination ? msg('process.recipeList.drag.moveTo', {folder: destination}) : null}
                </div>
            </div>
        </div>
    )
}

DragPreview.propTypes = {
    coords: PropTypes.object.isRequired,
    count: PropTypes.number.isRequired,
    icon: PropTypes.string.isRequired,
    name: PropTypes.string,
    destination: PropTypes.string
}
