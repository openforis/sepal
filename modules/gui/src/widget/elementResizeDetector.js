import _ from 'lodash'
import PropTypes from 'prop-types'
import {useCallback} from 'react'
import {useResizeDetector} from 'react-resize-detector'

const REFRESH_RATE_MS = 250

export const ElementResizeDetector = ({children, onResize, resize$, targetRef}) => {
    const onResizeCallback = useCallback(({width, height}) => {
        setImmediate(() => {
            onResize && onResize({width, height})
            resize$ && resize$.next({width, height})
        })
    }, [onResize, resize$])

    const {width, height} = useResizeDetector({
        refreshMode: 'throttle',
        refreshRate: REFRESH_RATE_MS,
        refreshOptions: {leading: true, trailing: true},
        targetRef,
        onResize: onResizeCallback
    })

    return (
        _.isFunction(children)
            ? children({width, height})
            : children
    )
}

ElementResizeDetector.propTypes = {
    children: PropTypes.any,
    debounce: PropTypes.number,
    resize$: PropTypes.object,
    onResize: PropTypes.func,
}
