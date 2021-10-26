import {msg} from 'translate'
import React from 'react'
import Tooltip from 'widget/tooltip'
import styles from './userResourceUsage.module.css'

export const UserResourceUsage = ({currentValue, budgetValue, formattedValue}) => {
    const percentage = Math.round(100 * currentValue / budgetValue)
    // const overbudget = currentValue > budgetValue
    const usage = Math.min(currentValue / budgetValue, 1)
    return (
        <Tooltip
            // className={[overbudget ? styles.overBudget : null].join(' ')}
            msg={msg('user.report.usage', {percentage})}
            delay={250}
            placement='topRight'
        >
            <div className={styles.usage} style={{'--usage': `${usage}`}}>
                {formattedValue}
            </div>
        </Tooltip>
    )
}
