import PropTypes from 'prop-types'
import {useState} from 'react'

import {fallbackLogoUrl, logoUrl} from '~/appsCatalog'
import {CrudItem} from '~/widget/crudItem'

import styles from './appItem.module.css'

export const AppItem = ({app, className, highlight, highlightClassName}) => {
    const [src, setSrc] = useState(logoUrl(app))

    const onError = () =>
        setSrc(current => current === logoUrl(app) ? fallbackLogoUrl(app) : null)

    const logo = src
        ? <img
            className={styles.logo}
            src={src}
            alt=''
            onError={onError}
        />
        : null

    return (
        <CrudItem
            className={className}
            title={app.label}
            description={app.tagline || '...'}
            image={logo}
            highlight={highlight}
            highlightClassName={highlightClassName}
        />
    )
}

AppItem.propTypes = {
    app: PropTypes.object,
    className: PropTypes.string,
    highlight: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    highlightClassName: PropTypes.string
}
