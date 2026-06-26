import {msg} from '~/translate'
import {Gauge} from '~/widget/gauge'
import {Tooltip} from '~/widget/tooltip'

import styles from './userResourceUsage.module.css'

export const UserResourceUsage = ({currentValue = 0, budgetValue = 0, formattedValue}) =>
    budgetValue >= 0
        ? (
            <Tooltip
                msg={
                    <Gauge
                        value={currentValue}
                        maxValue={budgetValue}
                        infoTop={({percentage}) => msg('user.report.usage', {percentage})}
                    />
                }
                delay={250}
                placement='topRight'
                disabled={budgetValue === 0}>
                <div className={styles.usage} style={{'--usage': `${Math.min(currentValue / budgetValue, 1)}`}}>
                    {formattedValue}
                </div>
            </Tooltip>
        )
        : null
