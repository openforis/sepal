import React from 'react'

import {msg} from '~/translate'

import {Button} from '../button'
import {ColorElement} from '../colorElement'
import {Layout} from '../layout'

export class ColorInput extends React.Component {
    state = {swap: false}

    render() {
        const {input, invalid, onChange} = this.props
        return (
            <ColorElement
                color={input.value}
                invalid={invalid}
                tooltip={this.renderTooltip()}
                tooltipPlacement='left'
                onChange={value => {
                    input.set(value)
                    onChange && onChange(value)
                }}
            />
        )
    }

    renderTooltip() {
        const {swap} = this.state
        return swap
            ? this.renderSwap()
            : this.renderColorButtons()
    }

    renderColorButtons() {
        return (
            <Button
                icon='exchange-alt'
                chromeless
                shape='circle'
                size='small'
                tooltip={msg('map.legendBuilder.colors.swap.tooltip')}
                onClick={() => this.setState({swap: true})}
            />
        )
    }

    renderSwap() {
        const {otherColors, onSwap} = this.props
        return (
            <Layout type='horizontal' spacing='tight' alignment='left'>
                {otherColors.map((c, i) =>
                    <ColorElement
                        key={i}
                        color={c}
                        onClick={() => {
                            this.setState({swap: false})
                            onSwap(c)
                        }}
                    />
                )}
            </Layout>
        )
    }
}

const COLORS = [
    '#FFB300',  // Vivid Yellow
    '#803E75',  // Strong Purple
    '#FF6800',  // Vivid Orange
    '#A6BDD7',  // Very Light Blue
    '#C10020',  // Vivid Red
    '#CEA262',  // Grayish Yellow
    '#817066',  // Medium Gray
    '#007D34',  // Vivid Green
    '#F6768E',  // Strong Purplish Pink
    '#00538A',  // Strong Blue
    '#FF7A5C',  // Strong Yellowish Pink
    '#53377A',  // Strong Violet
    '#FF8E00',  // Vivid Orange Yellow
    '#B32851',  // Strong Purplish Red
    '#F4C800',  // Vivid Greenish Yellow
    '#7F180D',  // Strong Reddish Brown
    '#93AA00',  // Vivid Yellowish Green
    '#593315',  // Deep Yellowish Brown
    '#F13A13',  // Vivid Reddish Orange
    '#232C16'  // Dark Olive Green
]

export const defaultColor = i => i < COLORS.length ? COLORS[i] : COLORS[COLORS.length - 1]
