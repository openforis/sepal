import fontawesome from '@fortawesome/fontawesome'
import far from '@fortawesome/fontawesome-free-regular'
import fas from '@fortawesome/fontawesome-free-solid'
import FontAwesomeIcon from '@fortawesome/react-fontawesome'
import PropTypes from 'prop-types'
import React from 'react'

fontawesome.library.add(fas)
fontawesome.library.add(far)

const Icon = ({name, type = 'solid', className, ...props}) => {
    console.log('type', type)
    console.log('fontAwesomeCollection(type)', fontAwesomeCollection(type))
    if (!name)
        return null
    else
        return <FontAwesomeIcon
            tag='i'
            icon={[fontAwesomeCollection(type), name]}
            spin={name === 'spinner'}
            className={className}
            {...props}/>
}

Icon.propTypes = Object.assign(FontAwesomeIcon.propTypes, {
    name: PropTypes.string
})

const fontAwesomeCollection = (type) => {
    switch (type) {
        case 'solid':
            return 'fas'
        case 'regular':
            return 'far'
        default:
            return 'fas'
    }
}

export default Icon