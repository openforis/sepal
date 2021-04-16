import {SplitContext} from './splitContext'
import {getLogger} from 'log'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './splitView.module.css'

const log = getLogger('splitView')

export class SplitOverlay extends React.Component {
    render() {
        const {area, children} = this.props
        return (
            <SplitContext.Consumer>
                {({container, mode, maximize}) => {
                    const single = mode === 'stack' && maximize
                    const hidden = single && maximize !== area
                    return (
                        <Portal type='container' container={container}>
                            <div className={_.flatten([
                                styles.area,
                                hidden ? styles.hide : styles.partial,
                                single ? styles.center : area.split('-').map(area => styles[area])
                            ]).join(' ')}>
                                {children}
                            </div>
                        </Portal>
                    )
                }}
            </SplitContext.Consumer>
        )
    }
}

SplitOverlay.propTypes = {
    area: PropTypes.string,
    children: PropTypes.any
}
