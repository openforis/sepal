import PropTypes from 'prop-types'
import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withMap} from '~/app/home/map/mapContext'
import {compose} from '~/compose'
import {formatCoordinates, parseCoordinates} from '~/coords'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {FloatingBox} from '~/widget/floatingBox'
import {Icon} from '~/widget/icon'
import {Keybinding} from '~/widget/keybinding'
import {SearchBox} from '~/widget/searchBox'
import {Toolbar} from '~/widget/toolbar/toolbar'
import {Tooltip} from '~/widget/tooltip'

import styles from './chartPixelButton.module.css'
import {rankCoordinateCandidates} from './coordinateCandidates'

const LONG_PRESS_DURATION_MS = 600
const LONG_PRESS_MOVE_TOLERANCE_PX = 8

class _ChartPixelButton extends React.Component {
    controlBoundsRef = React.createRef()
    longPressTimeout = null
    longPressStart = null
    longPressTriggered = false
    interactionMode = null

    state = {
        isSelecting: false,
        clickListener: null,
        showCoordinateInput: false,
        coordinateResults: [],
        autoHighlightCoordinate: false
    }

    render() {
        const {disabled} = this.props
        const {isSelecting, showCoordinateInput} = this.state
        const coordinateInputLabel = msg('process.chartPixel.coordinates.tooltip')
        return (
            <Keybinding disabled={!isSelecting} keymap={{Escape: () => this.cancelSelecting()}}>
                <div
                    className={[
                        styles.container,
                        showCoordinateInput ? styles.coordinateInputVisible : null
                    ].join(' ')}
                    onPointerDown={event => this.startLongPress(event)}
                    onPointerMove={event => this.moveLongPress(event)}
                    onPointerUp={() => this.endLongPress()}
                    onPointerCancel={() => this.abortLongPress()}
                    onContextMenu={event => event.preventDefault()}>
                    <span
                        ref={this.controlBoundsRef}
                        className={styles.controlBounds}/>
                    <Tooltip
                        msg={this.chartTooltip(isSelecting ? 'cancel' : 'start')}
                        placement='left'
                        disabled={showCoordinateInput}>
                        <span className={styles.mainTooltipTarget}>
                            <Toolbar.Button
                                className={styles.mainButton}
                                selected={isSelecting}
                                onClick={() => this.onMainButtonClick()}
                                icon='chart-area'
                                disabled={disabled}
                            />
                        </span>
                    </Tooltip>
                    <Tooltip
                        msg={coordinateInputLabel}
                        placement='left'
                        disabled={showCoordinateInput}>
                        <button
                            type='button'
                            className={[
                                styles.chevron,
                                showCoordinateInput ? styles.chevronSelected : null
                            ].join(' ')}
                            aria-label={coordinateInputLabel}
                            disabled={disabled}
                            onClick={event => this.toggleCoordinateInput(event)}>
                            <Icon name='chevron-left'/>
                        </button>
                    </Tooltip>
                    {showCoordinateInput ? this.renderCoordinateInput() : null}
                </div>
            </Keybinding>
        )
    }

    renderCoordinateInput() {
        const {coordinateResults, autoHighlightCoordinate} = this.state
        return this.controlBoundsRef.current ? (
            <FloatingBox
                element={this.controlBoundsRef.current}
                hPlacement='left'
                vPlacement='over'
                onBlur={() => this.closeCoordinateInput()}>
                <div className={styles.coordinateDrawer}>
                    <SearchBox
                        autoHighlight={autoHighlightCoordinate}
                        debounce={0}
                        width='fill'
                        placeholder={msg('process.chartPixel.coordinates.placeholder')}
                        options={coordinateResults}
                        onSearchValue={query => this.searchCoordinates(query)}
                        onEscape={() => this.closeCoordinateInput()}
                        onSelect={({value}) => this.selectCoordinates(value)}
                    />
                </div>
            </FloatingBox>
        ) : null
    }

    toggleCoordinateInput(event) {
        event.stopPropagation()
        this.cancelSelecting()
        const {showCoordinateInput} = this.state
        showCoordinateInput
            ? this.closeCoordinateInput()
            : this.setState({showCoordinateInput: true})
    }

    closeCoordinateInput() {
        this.setState({
            showCoordinateInput: false,
            coordinateResults: [],
            autoHighlightCoordinate: false
        })
    }

    onMainButtonClick() {
        if (this.longPressTriggered) {
            this.longPressTriggered = false
            return
        }
        const {isSelecting} = this.state
        isSelecting ? this.cancelSelecting() : this.startSelecting()
    }

    startLongPress(event) {
        const {disabled} = this.props
        const isChevron = event.target.closest(`.${styles.chevron}`)
        if (disabled || isChevron || event.pointerType === 'mouse') {
            return
        }
        this.cancelLongPress()
        this.longPressStart = {x: event.clientX, y: event.clientY}
        this.longPressTimeout = setTimeout(() => {
            this.longPressTriggered = true
            this.cancelSelecting()
            this.setState({showCoordinateInput: true})
        }, LONG_PRESS_DURATION_MS)
    }

    moveLongPress(event) {
        if (this.longPressStart) {
            const {x, y} = this.longPressStart
            const moved = Math.hypot(event.clientX - x, event.clientY - y)
            if (moved > LONG_PRESS_MOVE_TOLERANCE_PX) {
                this.cancelLongPress()
            }
        }
    }

    endLongPress() {
        this.cancelLongPress()
        setTimeout(() => {
            this.longPressTriggered = false
        })
    }

    abortLongPress() {
        this.cancelLongPress()
        this.longPressTriggered = false
    }

    cancelLongPress() {
        clearTimeout(this.longPressTimeout)
        this.longPressTimeout = null
        this.longPressStart = null
    }

    searchCoordinates(query) {
        const {bounds} = this.props
        const {candidates, autoHighlight} = rankCoordinateCandidates({
            candidates: parseCoordinates(query),
            bounds
        })
        const coordinateResults = candidates.map(({candidate, withinBounds}) => ({
            label: (
                <div className={styles.coordinateOption}>
                    <div>{msg('process.chartPixel.coordinates.latitude', {value: candidate.lat})}</div>
                    <div>{msg('process.chartPixel.coordinates.longitude', {value: candidate.lng})}</div>
                    {this.renderBoundsStatus(withinBounds)}
                </div>
            ),
            value: candidate,
            key: formatCoordinates(candidate)
        }))
        this.setState({
            coordinateResults,
            autoHighlightCoordinate: autoHighlight
        })
    }

    renderBoundsStatus(withinBounds) {
        return withinBounds === null ? null : (
            <div className={withinBounds ? styles.withinBounds : styles.outsideBounds}>
                <Icon name={withinBounds ? 'check' : 'exclamation-triangle'}/>
                <span>{msg(`process.chartPixel.coordinates.${
                    withinBounds ? 'withinBounds' : 'outsideBounds'
                }`)}</span>
            </div>
        )
    }

    selectCoordinates(latLng) {
        const {map, onPixelSelected} = this.props
        this.closeCoordinateInput()
        map.setView({center: latLng, zoom: map.getZoom()})
        onPixelSelected(latLng)
    }

    startSelecting() {
        const {map, onPixelSelected} = this.props
        const clickListener = map.addOneShotClickListener(
            latLng => {
                this.stopInteractionMode()
                this.setState({isSelecting: false, clickListener: null})
                onPixelSelected(latLng)
            }
        )
        this.interactionMode = map.enterInteractionMode('chart')

        this.setState({
            isSelecting: true,
            clickListener,
            showCoordinateInput: false,
            coordinateResults: [],
            autoHighlightCoordinate: false
        })
    }

    cancelSelecting() {
        const {clickListener} = this.state
        clickListener && clickListener.remove()
        this.stopInteractionMode()
        this.setState({isSelecting: false, clickListener: null})
    }

    stopInteractionMode() {
        this.interactionMode?.remove()
        this.interactionMode = null
    }

    chartTooltip(action) {
        const {tooltipKey} = this.props
        return msg(`${tooltipKey}.${action}.tooltip`)
    }

    componentWillUnmount() {
        this.cancelLongPress()
        this.state.clickListener?.remove()
        this.stopInteractionMode()
    }
}

export const ChartPixelButton = compose(
    _ChartPixelButton,
    withRecipe(recipe => ({bounds: selectFrom(recipe, 'ui.bounds')})),
    withMap()
)

ChartPixelButton.propTypes = {
    onPixelSelected: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    tooltipKey: PropTypes.string
}

ChartPixelButton.defaultProps = {
    tooltipKey: 'process.chartPixel'
}
