import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Layout} from '~/widget/layout'

import {CALCULATION_ERROR} from './eeCalculationError'

// Renders a failed Sampling Design calculation inline: the classified message plus recovery actions. Retry
// reruns the current strategy; "Use Batch" is only offered for a true EE failure that was running Online.
export const CalculationErrorContent = ({error: {type, strategy, message}, onRetry, onUseBatch}) => {
    const retryLabel = strategy === 'ONLINE'
        ? msg('process.samplingDesign.calculationError.retryOnline')
        : msg('process.samplingDesign.calculationError.submitBatchAgain')
    const offerBatch = type === CALCULATION_ERROR.EARTH_ENGINE && strategy === 'ONLINE'
    return (
        <Layout type='vertical' spacing='compact'>
            <div>{message}</div>
            <Layout type='horizontal' spacing='compact'>
                <Button
                    look='add'
                    size='x-small'
                    shape='pill'
                    icon='rotate'
                    label={retryLabel}
                    onClick={onRetry}
                />
                {offerBatch
                    ? <Button
                        size='x-small'
                        shape='pill'
                        icon='tasks'
                        label={msg('process.samplingDesign.calculationError.useBatch')}
                        onClick={onUseBatch}
                    />
                    : null}
            </Layout>
        </Layout>
    )
}

CalculationErrorContent.propTypes = {
    error: PropTypes.object.isRequired,
    onRetry: PropTypes.func.isRequired,
    onUseBatch: PropTypes.func
}
