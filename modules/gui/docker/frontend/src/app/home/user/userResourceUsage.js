import {Gauge} from 'widget/gauge'
import {msg} from 'translate'
import React from 'react'
import Tooltip from 'widget/tooltip'
import styles from './userResourceUsage.module.css'

export const UserResourceUsage = ({currentValue, budgetValue, formattedValue}) => {
    const usage = Math.min(currentValue / budgetValue, 1)
    return (
        <Tooltip
            // className={[overbudget ? styles.overBudget : null].join(' ')}
            msg={
                <Gauge
                    value={currentValue}
                    maxValue={budgetValue}
                    infoTop={({percentage}) => msg('user.report.usage', {percentage})}
                />
            }
            delay={250}
            placement='topRight'>
            <div className={styles.usage} style={{'--usage': `${usage}`}}>
                {formattedValue}
            </div>
        </Tooltip>
    )
}
