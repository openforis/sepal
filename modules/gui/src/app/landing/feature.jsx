import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {Icon} from '~/widget/icon'

import styles from './feature.module.css'

export const Feature = ({icon, name}) =>
    <div className={styles.feature}>
        <div className={[styles.featureIcon, styles[name]].join(' ')}>
            <Icon name={icon}/>
        </div>
        <div>
            <h3 className={styles.featureTitle}>
                {msg(`landing.features.${name}.title`)}
            </h3>
            <p className={styles.featureDescription}>
                {msg(`landing.features.${name}.description`)}
            </p>
        </div>
    </div>

Feature.propTypes = {
    icon: PropTypes.string,
    name: PropTypes.string
}
