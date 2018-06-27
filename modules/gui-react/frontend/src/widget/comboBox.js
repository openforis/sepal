import PropTypes from 'prop-types'
import React from 'react'
import Select from 'react-select'
import {msg} from 'translate'
import Icon from 'widget/icon'
import styles from './comboBox.css'

class ComboBox extends React.Component {
    element = React.createRef()

    render() {
        let {
            input,
            validate = 'onBlur',
            maxMenuHeight,
            onChange,
            isLoading,
            menuPlacement = 'bottom',
            className,
            onBlur,
            ...props
        } = this.props

        const calculateMaxMenuHeight = () => {
            const dimensions = this.element.current.getBoundingClientRect()
            return menuPlacement === 'bottom'
                ? document.body.offsetHeight - (dimensions.top + dimensions.height * 2)
                : document.body.offsetHeight
        }
        if (!maxMenuHeight)
            maxMenuHeight = this.element.current ? calculateMaxMenuHeight() : '15rem'
        return (
            <div className={[styles.comboBox, className, input.error ? 'error' : null].join(' ')} ref={this.element}>
                <Select
                    {...props}
                    name={input.name}
                    value={props.options.find(option => option.value === input.value) || null}
                    classNamePrefix='comboBox'
                    maxMenuHeight={maxMenuHeight}
                    menuPlacement={menuPlacement}
                    menuPortalTarget={document.getElementById('portalTarget')}
                    isClearable={true}
                    isLoading={!!isLoading}
                    loadingMessage={msg('widget.comboBox.loading')}
                    components={{LoadingIndicator}}
                    onChange={(e) => {
                        input.handleChange({target: {value: e ? e.value : '', name: input.name}})
                        if (onChange)
                            onChange(e)
                        if (validate === 'onChange')
                            input.validate()
                    }}
                    onBlur={(e) => {
                        if (onBlur)
                            onBlur(e)
                        if (validate === 'onBlur')
                            input.validate()
                    }}
                />
            </div>
        )
    }
}

ComboBox.propTypes = {
    input: PropTypes.object.isRequired,
    validate: PropTypes.oneOf(['onChange', 'onBlur']),
    ...Select.propTypes
}
export default ComboBox

const LoadingIndicator = () => {
    return (
        <Icon name='spinner'/>
    )
}