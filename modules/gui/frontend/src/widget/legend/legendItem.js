import {ColorElement} from 'widget/colorElement'
import {Layout} from 'widget/layout'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './legendItem.module.css'

export class LegendItem extends React.Component {
    render() {
        const {color, value, label, selected, onClick} = this.props
        return (
            <Layout type='horizontal-nowrap'>
                <Layout type='horizontal-nowrap' spacing='compact'>
                    <ColorElement color={color} onClick={onClick}/>
                    <div className={styles.label}>{label}</div>
                    <div className={styles.value}>({value})</div>
                </Layout>
                {selected ? <Icon name={'check'}/> : null}
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