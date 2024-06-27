import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {Portal} from '~/widget/portal'

import {SplitContext} from './splitContext'
import styles from './splitView.module.css'

export class SplitOverlay extends React.Component {
    constructor() {
        super()
        this.renderSplitContext = this.renderSplitContext.bind(this)
    }

    render() {
        return (
            <SplitContext.Consumer>
                {this.renderSplitContext}
            </SplitContext.Consumer>
        )
    }

    renderSplitContext({container, mode, maximize}) {
        const {area, children} = this.props
        const single = mode === 'stack' && maximize
        const hidden = single && maximize !== area
        return !hidden ? (
            <Portal type='container' container={container}>
                <div className={_.flatten([
                    styles.areaOverlay,
                    single ? styles.center : area.split('-').map(area => styles[area])
                ]).join(' ')}>
                    {children}
                </div>
            </Portal>
        ) : null
    }
}

SplitOverlay.propTypes = {
    area: PropTypes.string,
    children: PropTypes.any
}
