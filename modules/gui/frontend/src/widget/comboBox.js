// import {ErrorMessage} from 'widget/form'
// import {connect, select} from 'store'
// import {isMobile} from 'widget/userAgent'
// import {msg} from 'translate'
// import Icon from 'widget/icon'
// import Label from 'widget/label'
// import Portal from 'widget/portal'
// import PropTypes from 'prop-types'
// import React from 'react'
// import Select, {components} from 'react-select'
// import styles from './comboBox.css'

// const mapStateToProps = () => ({
//     appDimensions: select('dimensions')
// })

// class ComboBox extends React.Component {
//     state = {}
//     element = React.createRef()
//     menuPortalTarget = React.createRef()

//     renderLabel() {
//         const {label, tooltip, tooltipPlacement = 'top'} = this.props
//         return label ? (
//             <Label
//                 msg={label}
//                 tooltip={tooltip}
//                 tooltipPlacement={tooltipPlacement}
//             />
//         ) : null
//     }

//     renderComboBox() {
//         const {
//             input,
//             validate = 'onBlur',
//             isClearable = true,
//             isLoading,
//             showChevron = true,
//             showCurrentSelection = true,
//             isSearchable = !isMobile(),
//             menuPlacement = 'bottom',
//             controlClassName,
//             menuClassName,
//             onChange,
//             onBlur,
//             children,
//             ...props
//         } = this.props
//         const components = {LoadingIndicator}
//         if (!showChevron)
//             components.DropdownIndicator = null
//         if (children)
//             components.SingleValue = createSingleValue(children)
//         return (
//             <div ref={this.element}
//                 className={[styles.comboBox, controlClassName, input.error ? 'error' : null].join(' ')}>
//                 <Portal>
//                     <div ref={this.menuPortalTarget} className={[menuClassName, 'portalTarget'].join(' ')}/>
//                 </Portal>
//                 <Select
//                     {...props}
//                     name={input.name}
//                     value={showCurrentSelection ? this.state.selectedOption : null}
//                     classNamePrefix='comboBox'
//                     maxMenuHeight={this.state.maxMenuHeight}
//                     menuPlacement={menuPlacement}
//                     menuPortalTarget={this.menuPortalTarget.current}
//                     isClearable={isClearable}
//                     isLoading={!!isLoading}
//                     isSearchable={isSearchable}
//                     loadingMessage={() => msg('widget.comboBox.loading')}
//                     components={components}
//                     onChange={e => {
//                         input.handleChange({target: {value: e ? e.value : '', name: input.name}})
//                         if (onChange)
//                             onChange(e)
//                         if (validate === 'onChange')
//                             input.validate()
//                     }}
//                     onBlur={e => {
//                         if (onBlur)
//                             onBlur(e)
//                         if (validate === 'onBlur')
//                             input.validate()
//                     }}
//                 />
//             </div>
//         )
//     }

//     renderErrorMessage() {
//         const {errorMessage, input} = this.props
//         return errorMessage ? (
//             <ErrorMessage for={errorMessage === true ? input.name : errorMessage}/>
//         ) : null
//     }

//     render() {
//         return (
//             <div>
//                 {this.renderLabel()}
//                 {this.renderComboBox()}
//                 {this.renderErrorMessage()}
//             </div>
//         )
//     }

//     componentDidMount() {
//         this.updateSelectedOption()
//         this.updateMaxMenuHeight()
//     }

//     componentDidUpdate(prevProps) {
//         const value = this.props.input.value
//         if (prevProps.input.value !== value || prevProps.options !== this.props.options)
//             this.updateSelectedOption()

//         const appHeight = this.props.appDimensions.height
//         if (this.element.current && prevProps.appDimensions.height !== appHeight)
//             this.updateMaxMenuHeight()
//     }

//     updateMaxMenuHeight() {
//         const appHeight = this.props.appDimensions.height
//         const comboBoxBox = this.element.current.getBoundingClientRect()
//         const availableSpace = (
//             this.props.menuPlacement === 'top'
//                 ? comboBoxBox.top
//                 : appHeight - comboBoxBox.bottom
//         ) - 10

//         let maxMenuHeightProp = this.props.maxMenuHeight || '20rem'
//         if (maxMenuHeightProp.toString().toLowerCase().endsWith('rem'))
//             maxMenuHeightProp = parseFloat(maxMenuHeightProp) * parseFloat(getComputedStyle(document.documentElement).fontSize)
//         const maxMenuHeight = Math.trunc(Math.min(availableSpace, maxMenuHeightProp))
//         this.setState(prevState => ({...prevState, maxMenuHeight}))
//     }

//     updateSelectedOption() {
//         const value = this.props.input.value
//         let selectedOption = null

//         const setSelected = option => {
//             if (option.value === value)
//                 selectedOption = option
//             return option.value === value
//         }

//         this.props.options.find(option =>
//             option.options
//                 ? option.options.find(setSelected)
//                 : setSelected(option)
//         )
//         this.setState(prevState => ({...prevState, selectedOption}))

//     }
// }

// ComboBox.propTypes = {
//     input: PropTypes.object.isRequired,
//     validate: PropTypes.oneOf(['onChange', 'onBlur']),
//     ...Select.propTypes
// }
// export default connect(mapStateToProps)(ComboBox)

// const LoadingIndicator = () => {
//     return (
//         <Icon name='spinner'/>
//     )
// }

// const createSingleValue = children => {
//     const SingleValue = props => (
//         <components.SingleValue {...props}>
//             {children && children(props)}
//         </components.SingleValue>
//     )
//     return SingleValue
// }
