import PropTypes from 'prop-types'

import {Icon} from '~/widget/icon'

import styles from './calculationProgress.module.css'

// Renders a Sampling Design calculation in progress inline: a short status beside the spinner and, where there is
// one, why it runs directly below the status, indented past the spinner.
export const CalculationProgress = ({status, explanation}) =>
    <div className={styles.progress}>
        <Icon name='spinner'/>
        <div>
            <div>{status}</div>
            {explanation ? <div>{explanation}</div> : null}
        </div>
    </div>

CalculationProgress.propTypes = {
    status: PropTypes.string.isRequired,
    explanation: PropTypes.string
}
