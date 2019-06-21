import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {fab} from '@fortawesome/free-brands-svg-icons'
import {far} from '@fortawesome/free-regular-svg-icons'
import {fas} from '@fortawesome/free-solid-svg-icons'
import PropTypes from 'prop-types'
import React from 'react'
import fontawesome from '@fortawesome/fontawesome'
import styles from './icon.module.css'

fontawesome.library.add(fab)
fontawesome.library.add(fas)
fontawesome.library.add(far)

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

export default class Icon extends React.Component {
    render() {
        return (
            <i className={styles.icon}>{this.renderIcon()}</i>
        )
    }

    renderIcon() {
        const {name, type, className, flipHorizontal, flipVertical} = this.props
        const flip = flipHorizontal
            ? flipVertical
                ? 'both'
                : 'horizontal'
            : flipVertical
                ? 'vertical'
                : null
        return (
            <FontAwesomeIcon
                tag='i'
                icon={[fontAwesomeCollection(type), name]}
                spin={name === 'spinner'}
                flip={flip}
                className={className}
            />
        )
    }
}

Icon.propTypes = {
    name: PropTypes.string.isRequired,
    className: PropTypes.string,
    flipHorizontal: PropTypes.any,
    flipVertical: PropTypes.any,
    type: PropTypes.string
}

Icon.defaultProps = {
    type: 'solid'
}
