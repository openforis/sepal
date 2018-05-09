import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import ReactSelect from 'react-select'
import styles from './comboBox.css'

const ComboBox = (
    {
        input,
        scalingFactor = 0.8,
        validate = 'onBlur',
        onChange,
        isLoading,
        className,
        onBlur, ...
        props
    }) => {
    return <Select
        {...props}
        name={input.name}
        value={input.value}
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
        isLoading={!!isLoading}
        className={[styles.comboBox, className, input.errorClass].join(' ')}
        scalingFactor={scalingFactor}
    />
}


class Select extends ReactSelect {
    renderOuter(options, valueArray, focusedOption) {
        const dimensions = this.wrapper ? this.wrapper.getBoundingClientRect() : null
        const menu = super.renderMenu(options, valueArray, focusedOption)

        if (!menu || !dimensions) return null

        const maxHeight = document.body.offsetHeight - (dimensions.top + dimensions.height)
        return ReactDOM.createPortal(
            <div
                ref={ref => {
                    this.menuContainer = ref
                }}
                className="Select-menu-outer"
                onClick={(e) => {
                    e.stopPropagation()
                }}
                style={{
                    ...this.props.menuContainerStyle,
                    zIndex: 9999,
                    position: 'absolute',
                    width: dimensions.width,
                    top: dimensions.top + dimensions.height,
                    left: dimensions.left,
                    maxHeight: Math.min(maxHeight, 200),
                    overflow: 'hidden',
                    fontSize: `calc(1rem * ${this.props.scalingFactor})`
                }}
            >
                <div
                    ref={ref => {
                        this.menu = ref
                    }}
                    role="listbox"
                    tabIndex={-1}
                    className="Select-menu"
                    id={`${this._instancePrefix}-list`}
                    style={{
                        ...this.props.menuStyle,
                        maxHeight: Math.min(maxHeight, 200)
                    }}
                    onScroll={this.handleMenuScroll}
                    onMouseDown={this.handleMouseDownOnMenu}
                >
                    {menu}
                </div>
            </div>,
            document.body
        )
    }
}


const stringOrNode = PropTypes.oneOfType([PropTypes.string, PropTypes.node])
const stringOrNumber = PropTypes.oneOfType([PropTypes.string, PropTypes.number])

ComboBox.propTypes = {
    input: PropTypes.object.isRequired,
    validate: PropTypes.oneOf(['onChange', 'onBlur']),
    'aria-describedby': PropTypes.string, // html id(s) of element(s) that should be used to describe this input (for assistive tech)
    'aria-label': PropTypes.string, // aria label (for assistive tech)
    'aria-labelledby': PropTypes.string, // html id of an element that should be used as the label (for assistive tech)
    arrowRenderer: PropTypes.func, // create the drop-down caret element
    autoBlur: PropTypes.bool, // automatically blur the component when an option is selected
    autoFocus: PropTypes.bool, // autofocus the component on mount
    autofocus: PropTypes.bool, // deprecated; use autoFocus instead
    autosize: PropTypes.bool, // whether to enable autosizing or not
    backspaceRemoves: PropTypes.bool, // whether backspace removes an item if there is no text input
    backspaceToRemoveMessage: PropTypes.string, // message to use for screenreaders to press backspace to remove the current item - {label} is replaced with the item label
    className: PropTypes.string, // className for the outer element
    clearAllText: stringOrNode, // title for the "clear" control when multi: true
    clearRenderer: PropTypes.func, // create clearable x element
    clearValueText: stringOrNode, // title for the "clear" control
    clearable: PropTypes.bool, // should it be possible to reset value
    closeOnSelect: PropTypes.bool, // whether to close the menu when a value is selected
    deleteRemoves: PropTypes.bool, // whether delete removes an item if there is no text input
    delimiter: PropTypes.string, // delimiter to use to join multiple values for the hidden field value
    disabled: PropTypes.bool, // whether the Select is disabled or not
    escapeClearsValue: PropTypes.bool, // whether escape clears the value when the menu is closed
    filterOption: PropTypes.func, // method to filter a single option (option, filterString)
    filterOptions: PropTypes.any, // boolean to enable default filtering or function to filter the options array ([options], filterString, [values])
    id: PropTypes.string, // html id to set on the input element for accessibility or tests
    ignoreAccents: PropTypes.bool, // whether to strip diacritics when filtering
    ignoreCase: PropTypes.bool, // whether to perform case-insensitive filtering
    inputProps: PropTypes.object, // custom attributes for the Input
    inputRenderer: PropTypes.func, // returns a custom input component
    instanceId: PropTypes.string, // set the components instanceId
    isLoading: PropTypes.any, // whether the Select is loading externally or not (such as options being loaded)
    joinValues: PropTypes.bool, // joins multiple values into a single form field with the delimiter (legacy mode)
    labelKey: PropTypes.string, // path of the label value in option objects
    matchPos: PropTypes.string, // (any|start) match the start or entire string when filtering
    matchProp: PropTypes.string, // (any|label|value) which option property to filter on
    menuBuffer: PropTypes.number, // optional buffer (in px) between the bottom of the viewport and the bottom of the menu
    menuContainerStyle: PropTypes.object, // optional style to apply to the menu container
    menuRenderer: PropTypes.func, // renders a custom menu with options
    menuStyle: PropTypes.object, // optional style to apply to the menu
    multi: PropTypes.bool, // multi-value input
    name: PropTypes.string, // generates a hidden <input /> tag with this field name for html forms
    noResultsText: stringOrNode, // placeholder displayed when there are no matching search results
    onBlur: PropTypes.func, // onBlur handler: function (event) {}
    onBlurResetsInput: PropTypes.bool, // whether input is cleared on blur
    onChange: PropTypes.func, // onChange handler: function (newValue) {}
    onClose: PropTypes.func, // fires when the menu is closed
    onCloseResetsInput: PropTypes.bool, // whether input is cleared when menu is closed through the arrow
    onFocus: PropTypes.func, // onFocus handler: function (event) {}
    onInputChange: PropTypes.func, // onInputChange handler: function (inputValue) {}
    onInputKeyDown: PropTypes.func, // input keyDown handler: function (event) {}
    onMenuScrollToBottom: PropTypes.func, // fires when the menu is scrolled to the bottom; can be used to paginate options
    onOpen: PropTypes.func, // fires when the menu is opened
    onSelectResetsInput: PropTypes.bool, // whether input is cleared on select (works only for multiselect)
    onValueClick: PropTypes.func, // onClick handler for value labels: function (value, event) {}
    openOnClick: PropTypes.bool, // boolean to control opening the menu when the control is clicked
    openOnFocus: PropTypes.bool, // always open options menu on focus
    optionClassName: PropTypes.string, // additional class(es) to apply to the <Option /> elements
    optionComponent: PropTypes.func, // option component to render in dropdown
    optionRenderer: PropTypes.func, // optionRenderer: function (option) {}
    options: PropTypes.array, // array of options
    pageSize: PropTypes.number, // number of entries to page when using page up/down keys
    placeholder: stringOrNode, // field placeholder, displayed when there's no value
    removeSelected: PropTypes.bool, // whether the selected option is removed from the dropdown on multi selects
    required: PropTypes.bool, // applies HTML5 required attribute when needed
    resetValue: PropTypes.any, // value to use when you clear the control
    rtl: PropTypes.bool, // set to true in order to use react-select in right-to-left direction
    scrollMenuIntoView: PropTypes.bool, // boolean to enable the viewport to shift so that the full menu fully visible when engaged
    searchable: PropTypes.bool, // whether to enable searching feature or not
    simpleValue: PropTypes.bool, // pass the value to onChange as a simple value (legacy pre 1.0 mode), defaults to false
    style: PropTypes.object, // optional style to apply to the control
    tabIndex: stringOrNumber, // optional tab index of the control
    tabSelectsValue: PropTypes.bool, // whether to treat tabbing out while focused to be value selection
    trimFilter: PropTypes.bool, // whether to trim whitespace around filter value
    value: PropTypes.any, // initial field value
    valueComponent: PropTypes.func, // value component to render
    valueKey: PropTypes.string, // path of the label value in option objects
    valueRenderer: PropTypes.func, // valueRenderer: function (option) {}
    wrapperStyle: PropTypes.object // optional style to apply to the component wrapper
}
export default ComboBox