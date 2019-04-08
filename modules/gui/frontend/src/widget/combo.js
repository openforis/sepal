import {Button, ButtonGroup} from 'widget/button'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import escapeStringRegexp from 'escape-string-regexp'
import styles from './combo.module.css'

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class Combo extends React.Component {
    ref = React.createRef()
    state = {
        edit: false,
        dimensions: {}
    }

    render() {
        const {edit} = this.state
        return (
            <div className={styles.combo}>
                {this.renderInput()}
                {edit ? this.renderSelectionList() : null}
            </div>
        )
    }

    renderInput() {
        const {filter} = this.state
        return (
            <input
                ref={this.ref}
                type='search'
                value={filter}
                onFocus={() => this.setState({edit: true})}
                onChange={e => this.setFilter(e.target.value)}/>
        )
    }

    renderSelectionList() {
        const {placement = 'bottom'} = this.props
        const {dimensions: {height, top, bottom, left, right}} = this.state
        const placementHeight = {
            top: top,
            bottom: height - bottom
        }
        const style = {
            '--left': left,
            '--height': placementHeight[placement],
            '--width': right - left,
            '--top': top,
            '--bottom': bottom
        }
        return (
            <Portal>
                <div
                    className={[styles.container, styles[placement]].join(' ')}
                    style={style}>
                    <ScrollableContainer>
                        <Scrollable>
                            <ButtonGroup
                                className={styles.items}
                                type='vertical-tight'>
                                {this.renderItems()}
                            </ButtonGroup>
                        </Scrollable>
                    </ScrollableContainer>
                </div>
            </Portal>
        )
    }

    setFilter(filter) {
        this.setState({
            filter,
            filterRegexp: RegExp(escapeStringRegexp(filter), 'i')
        })
    }

    renderItems() {
        const {options} = this.props
        const {filterRegexp} = this.state
        return options
            .filter(item => filterRegexp.test(item.label))
            .map(item => this.renderItem(item))
    }

    renderItem(item) {
        return (
            <Button
                key={item.value}
                chromeless
                className={styles.item}
                label={item.label}
                alignment='left'
                onClick={() => this.selectItem(item)}
            />
        )
    }

    selectItem(item) {
        const {input} = this.props
        this.setFilter(item.label)
        this.setState({edit: false})
        input.set(item.value)
    }

    componentDidMount() {
        // const {options, input} = this.props
        // const selectedOption = options && input && options.find(option => option.value === input.value)
        // console.log(selectedOption)
        // const filter = selectedOption
        //     ? selectedOption.label
        //     : ''

        this.setFilter('')
        this.updateDimensions()
        // this.setState({filter})
    }

    componentDidUpdate() {
        const {options, input} = this.props
        const selectedOption = options && input && options.find(option => option.value === input.value)
        const filter = selectedOption
            ? selectedOption.label
            : ''
        console.log({selectedOption, filter})
        
        this.updateDimensions()
    }

    updateDimensions() {
        const {dimensions} = this.props
        const ref = this.ref.current
        const boundingBox = ref
            ? ref.getBoundingClientRect()
            : {}

        const updatedState = (prevState, state) =>
            _.isEqual(prevState.dimensions, state.dimensions)
                ? null
                : state

        this.setState(prevState =>
            updatedState(prevState, {
                dimensions: {
                    height: dimensions.height,
                    top: boundingBox.top,
                    bottom: boundingBox.bottom,
                    left: boundingBox.left,
                    right: boundingBox.right
                }
            })
        )
    }
}

export default connect(mapStateToProps)(Combo)

Combo.propTypes = {
    input: PropTypes.any.isRequired,
    options: PropTypes.any.isRequired,
    placement: PropTypes.oneOf(['top', 'bottom'])
}
