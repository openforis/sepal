import PropTypes from 'prop-types'

import styles from './noData.module.css'

export const NoData = ({alignment = 'center', message, className, children}) =>
    <div className={[
        styles.noData,
        styles[alignment],
        className
    ].join(' ')}>
        {message || children}
    </div>

NoData.propTypes = {
    message: PropTypes.string.isRequired,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    className: PropTypes.string,
}
