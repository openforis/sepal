import React from 'react'
import FontAwesome from 'react-fontawesome'
import 'font-awesome/css/font-awesome.css'
import PropTypes from 'prop-types'

const Icon = ({name, ...props}) => {
    if (!name)
        return null
    else
        return <FontAwesome tag='i' name={name} {...props} spin={name === 'spinner'}/>
}

Icon.propTypes = Object.assign(FontAwesome.propTypes, {
    name: PropTypes.string
})

export default Icon