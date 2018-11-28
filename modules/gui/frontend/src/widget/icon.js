import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import PropTypes from 'prop-types'
import React from 'react'
import fab from '@fortawesome/fontawesome-free-brands'
import far from '@fortawesome/fontawesome-free-regular'
import fas from '@fortawesome/fontawesome-free-solid'
import fontawesome from '@fortawesome/fontawesome'
import styles from './icon.module.css'

fontawesome.library.add(fab)
fontawesome.library.add(fas)
fontawesome.library.add(far)

const Icon = ({name, type = 'solid', className, ...props}) => {
    if (!name)
        return null
    else
        return <i className={styles.icon}><FontAwesomeIcon
            tag='i'
            icon={[fontAwesomeCollection(type), name]}
            spin={name === 'spinner'}
            className={className}
            {...props}/></i>
}

Icon.propTypes = Object.assign(FontAwesomeIcon.propTypes, {
    name: PropTypes.string
})

const fontAwesomeCollection = type => {
    switch (type) {
    case 'solid':
        return 'fas'
    case 'regular':
        return 'far'
    case 'brands':
        return 'fab'
    default:
        throw Error('Unsupported icon type: ' + type)
    }
}

export default Icon

Icon.propTypes = {
    name: PropTypes.string.isRequired,
    className: PropTypes.string,
    type: PropTypes.string
}
