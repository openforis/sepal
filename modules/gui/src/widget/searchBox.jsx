import PropTypes from 'prop-types'
import React from 'react'
import {debounceTime, distinctUntilChanged, filter, merge, Subject} from 'rxjs'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {FloatingBox} from '~/widget/floatingBox'
import {Input} from '~/widget/input'
import {Keybinding} from '~/widget/keybinding'
import {ScrollableList} from '~/widget/list'
import {Shape} from '~/widget/shape'

import styles from './searchBox.module.css'

class _SearchBox extends React.Component {
    inputRef = React.createRef()
    containerRef = React.createRef()
    listRef = React.createRef()

    search$ = new Subject()
    select$ = new Subject()
    showOptions$ = new Subject()

    state = {
        value: '',
        showOptions: true
    }

    constructor(props) {
        super(props)
        this.showOptions = this.showOptions.bind(this)
        this.hideOptions = this.hideOptions.bind(this)
        this.selectOption = this.selectOption.bind(this)
        this.clear = this.clear.bind(this)
        this.focus = this.focus.bind(this)
        this.onChange = this.onChange.bind(this)
    }

    render() {
        const {placeholder, className, size, width} = this.props
        const {value, showOptions} = this.state
        return (
            <Keybinding keymap={{
                Escape: this.clear,
                ArrowDown: this.showOptions,
                'Ctrl+f': this.focus,
                'Meta+f': this.focus
            }}>
                <Shape
                    ref={this.containerRef}
                    shape='pill'
                    look='transparent'
                    size={size}
                    width={width}>
                    <Input
                        className={[styles.search, className].join(' ')}
                        type='search'
                        ref={this.inputRef}
                        value={value}
                        placeholder={placeholder}
                        autoFocus
                        border={false}
                        onFocus={this.showOptions}
                        onClick={this.showOptions}
                        onChange={this.onChange}
                    />
                </Shape>
                {showOptions ? this.renderOptions() : null}
            </Keybinding>
        )
    }

    clear() {
        this.setValue('')
    }

    onChange(e) {
        this.setValue(e.target.value)
    }

    renderOptions() {
        const {placement, options, optionsClassName, optionTooltipPlacement} = this.props
        return options && options.length
            ? (
                <FloatingBox
                    element={this.containerRef.current}
                    vPlacement={placement}
                    hPlacement='over'
                    onBlur={this.hideOptions}>
                    <ScrollableList
                        air='more'
                        className={optionsClassName || styles.options}
                        options={options}
                        onSelect={this.selectOption}
                        onCancel={this.hideOptions}
                        tooltipPlacement={optionTooltipPlacement}
                        autoHighlight
                        keyboard
                    />
                </FloatingBox>
            )
            : null
    }

    focus() {
        this.inputRef?.current?.focus()
    }

    showOptions() {
        this.showOptions$.next(true)
    }

    hideOptions() {
        this.showOptions$.next(false)
    }

    selectOption(option) {
        const {onSelect} = this.props
        onSelect && onSelect(option)
        this.hideOptions()
    }

    setValue(value) {
        this.setState({value})
        this.search$.next(value)
        this.showOptions()
    }

    componentDidMount() {
        const {value, onSearchValue, debounce, addSubscription} = this.props
        const {search$, showOptions$} = this
        this.setValue(value)

        const debouncedShowOptions$ = merge(
            showOptions$.pipe(
                filter(show => !show)
            ),
            showOptions$.pipe(
                debounceTime(250),
            )
        ).pipe(
            distinctUntilChanged()
        )

        const debouncedSearch$ = merge(
            search$.pipe(
                filter(value => !value) // skip debouncing when empty
            ),
            search$.pipe(
                debounceTime(debounce)
            )
        ).pipe(
            distinctUntilChanged()
        )

        addSubscription(
            debouncedShowOptions$.subscribe(
                showOptions => this.setState({showOptions})
            ),
            debouncedSearch$.subscribe(
                value => onSearchValue && onSearchValue(value)
            )
        )
    }
}

export const SearchBox = compose(
    _SearchBox,
    withSubscriptions(),
    asFunctionalComponent({
        debounce: 250,
        value: ''
    })
)

SearchBox.propTypes = {
    className: PropTypes.string,
    debounce: PropTypes.number,
    options: PropTypes.array,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']),
    shape: PropTypes.string,
    size: PropTypes.string,
    value: PropTypes.string,
    width: PropTypes.any,
    onSearchValue: PropTypes.func,
    onSelect: PropTypes.func
}
