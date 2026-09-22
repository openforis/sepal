import PropTypes from 'prop-types'

import {Button} from '~/widget/button'
import {Portal} from '~/widget/portal'

import styles from './floatingButton.module.css'

// Floats within the enclosing section or tab by default, so it shows and hides with it.
export const FloatingButton = ({type = 'context', additionalClassName, ...buttonProps}) => (
    <Portal type={type}>
        <Button
            {...buttonProps}
            additionalClassName={[styles.floatingButton, additionalClassName].join(' ')}
        />
    </Portal>
)

FloatingButton.propTypes = {
    ...Button.propTypes,
    type: PropTypes.oneOf(['global', 'context'])
}
