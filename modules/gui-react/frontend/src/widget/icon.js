import React from 'react'
import fontawesome from '@fortawesome/fontawesome'
import FontAwesomeIcon from '@fortawesome/react-fontawesome'
import fa from '@fortawesome/fontawesome-free-solid'
import PropTypes from 'prop-types'

fontawesome.library.add(fa)

const Icon = ({name, className, ...props}) => {
    if (!name)
        return null
    else
        return <FontAwesomeIcon 
            tag='i'
            icon={['fas', name]}
            spin={name === 'spinner'} 
            className={className}
            {...props}/>
}

Icon.propTypes = Object.assign(FontAwesomeIcon.propTypes, {
    name: PropTypes.string
})

export default Icon