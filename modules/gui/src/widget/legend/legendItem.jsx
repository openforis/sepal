import PropTypes from 'prop-types'
import React from 'react'

import {ColorElement} from '~/widget/colorElement'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'

import styles from './legendItem.module.css'

export class LegendItem extends React.Component {
    render() {
        const {color, value, label, selected, onClick} = this.props
        return (
            <Layout type='horizontal-nowrap'>
                <div className={styles.properties}>
                    <ColorElement color={color} onClick={onClick}/>
                    <div className={styles.label}>{label}</div>
                    <div className={styles.value}>({value})</div>
                </div>
                {onClick
                    ? selected
                        ? <Icon name={'check'}/>
                        : <div style={{visibility: 'hidden'}}><Icon name={'check'}/></div>
                    : null}
            </Layout>
        )
    }
}

LegendItem.propTypes = {
    color: PropTypes.string,
    label: PropTypes.string,
    selected: PropTypes.any,
    value: PropTypes.any,
    onClick: PropTypes.any,
}
