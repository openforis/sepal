import {Input} from 'widget/input'
import {ScrollableList} from 'widget/list'
import {Shape} from 'widget/shape'
import {Subject, merge} from 'rxjs'
import {compose} from 'compose'
import {debounceTime, distinctUntilChanged, filter} from 'rxjs/operators'
import FloatingBox from 'widget/floatingBox'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import escapeStringRegexp from 'escape-string-regexp'
import styles from './searchBox.module.css'
import withSubscriptions from 'subscription'

class _SearchBox extends React.Component {
    inputRef = React.createRef()
    containerRef = React.createRef()
    listRef = React.createRef()

    search$ = new Subject()
    select$ = new Subject()

    state = {
        value: '',
        showOptions: true
    }

    constructor() {
        super()
        this.showOptions = this.showOptions.bind(this)
        this.hideOptions = this.hideOptions.bind(this)
        this.selectOption = this.selectOption.bind(this)
    }

    render() {
        const {placeholder, className} = this.props
        const {value, showOptions} = this.state
        return (
            <Keybinding keymap={{
                Escape: () => this.setValue(''),
                ArrowDown: () => this.showOptions()
            }}>
                <Shape
                    look='transparent'
                    size='large'
                    ref={this.containerRef}
                    shape='pill'>
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
                        onChange={e => this.setValue(e.target.value)}
                    />
                </Shape>
                {showOptions ? this.renderOptions() : null}
            </Keybinding>
        )
    }

    renderOptions() {
        const {placement, options, optionsClassName, optionTooltipPlacement, alignment} = this.props
        return options && options.length
            ? (
                <FloatingBox
                    element={this.containerRef.current}
                    placement={placement}
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
                        alignment={alignment}
                    />
                </FloatingBox>
            )
            : null
    }

    showOptions() {
        this.setState({showOptions: true})
    }

    hideOptions() {
        this.setState({showOptions: false})
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
        const {onSearchValue, onSearchValues, debounce, addSubscription} = this.props
        const search$ = this.search$
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
            debouncedSearch$.subscribe(
                value => {
                    onSearchValue && onSearchValue(value)
                    onSearchValues && onSearchValues(
                        _.chain(value.split(/\s+/))
                            .map(filter => escapeStringRegexp(filter.trim()))
                            .compact()
                            .value()
                    )
                }
            )
        )
    }
}

export const SearchBox = compose(
    _SearchBox,
    withSubscriptions()
)

SearchBox.propTypes = {
    className: PropTypes.string,
    debounce: PropTypes.number,
    options: PropTypes.array,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    shape: PropTypes.string,
    value: PropTypes.string,
    onSearchValue: PropTypes.func,
    onSearchValues: PropTypes.func,
    onSelect: PropTypes.func
}

SearchBox.defaultProps = {
    debounce: 250
}
