import {ListItem} from './listItem'
import {Scrollable, ScrollableContainer} from './scrollable'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import flexy from './flexy.module.css'
import styles from './scroller.module.css'

export class Scroller extends React.Component {
    state = {
        topSpacerHeight: 0,
        bottomSpacerHeight: 0
    }

    constructor() {
        super()
    }

    render() {
        return (
            <ScrollableContainer>
                <Scrollable>
                    {this.renderTopSpacer()}
                    {this.renderVisibleContent()}
                    {this.renderBottomSpacer()}
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderVisibleContent() {
        const {items} = this.props
        return items.map((item, index) => this.renderItem(item, index))
    }

    renderItem(item, index) {
        return (
            <ListItem key={index} className={styles.item}>{item}</ListItem>
        )
    }

    renderTopSpacer() {
        const {topSpacerHeight} = this.state
        return (
            <div styles={{height: `${topSpacerHeight}px`}}/>
        )
    }

    renderBottomSpacer() {
        const {bottomSpacerHeight} = this.state
        return (
            <div styles={{height: `${bottomSpacerHeight}px`}}/>
        )
    }
}

Scroller.propTypes = {
    items: PropTypes.array.isRequired
}
