import {Button} from 'widget/button'
import {Subject, fromEvent} from 'rxjs'
import {connect} from 'store'
import {delay} from 'rxjs/operators'
import {selectFrom} from 'stateUtils'
import FloatingBox from 'widget/floatingBox'
import List from 'widget/list'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './combo.module.css'

const SELECTION_DELAY_MS = 350

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class ButtonSelect extends React.Component {
    subscriptions = []
    input = React.createRef()
    list = React.createRef()
    select$ = new Subject()
    state = {
        showOptions: false,
        flattenedOptions: [],
        selectedOption: null,
        selected: false
    }

    render() {
        const {className} = this.props
        const {showOptions} = this.state
        return (
            <div className={[styles.container, className].join(' ')}>
                {this.renderButton()}
                {showOptions ? this.renderOptions() : null}
            </div>
        )
    }

    renderButton() {
        const {disabled, label, look, icon, tooltip, tooltipPlacement} = this.props
        const {showOptions} = this.state
        return (
            <Button
                ref={this.input}
                label={label}
                look={look}
                icon={icon}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                onClick={() => showOptions
                    ? this.hideOptions()
                    : this.showOptions()
                }
                disabled={disabled}
            />
        )
    }

    renderOptions() {
        const {placement, optionsClassName} = this.props
        const {flattenedOptions, selectedOption, selected} = this.state
        return (
            <FloatingBox
                element={this.input.current}
                placement={placement}
                width='auto'
            >
                <List
                    ref={this.list}
                    className={optionsClassName || styles.options}
                    options={flattenedOptions}
                    selectedOption={selectedOption}
                    onSelect={option => this.select$.next(option)}
                    autoCenter={!selected}
                    keyboard
                />
            </FloatingBox>
        )
    }

    showOptions() {
        this.setState({showOptions: true})
    }

    hideOptions() {
        this.setState({showOptions: false})
    }

    setSelectedOption(selectedOption) {
        this.updateState({
            selectedOption,
            selected: true
        })
    }

    updateState(state, callback) {
        const updatedState = (prevState, state) =>
            _.isEqual(_.pick(prevState, _.keys(state)), state) ? null : state
        this.setState(
            prevState =>
                updatedState(prevState, _.isFunction(state) ? state(prevState) : state),
            callback
        )
    }

    handleSelect() {
        const {onSelect} = this.props
        this.subscriptions.push(
            this.select$.subscribe(
                option => {
                    this.setSelectedOption(option)
                    onSelect && onSelect(option)
                }
            ),
            this.select$.pipe(
                delay(SELECTION_DELAY_MS)
            ).subscribe(
                () => this.setState({selected: false}, this.hideOptions)
            )
        )
    }

    handleBlur() {
        const click$ = fromEvent(document, 'click')
        const isInputClick = e => this.input.current && this.input.current.contains(e.target)
        const isListClick = e => this.list.current && this.list.current.contains && this.list.current.contains(e.target)
        this.subscriptions.push(
            click$.subscribe(e => {
                if (!isInputClick(e) && !isListClick(e)) {
                    this.hideOptions()
                }
            })
        )
    }

    componentDidMount() {
        this.handleSelect()
        this.handleBlur()
    }

    componentDidUpdate() {
        this.updateOptions()
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }

    updateOptions() {
        const {options} = this.props
        const getFlattenedOptions = options =>
            _.flatten(
                options.map(option =>
                    option.options
                        ? [{label: option.label, group: true}, ...option.options]
                        : option
                )
            )
        this.updateState({
            flattenedOptions: getFlattenedOptions(options)
        })
    }
}

export default connect(mapStateToProps)(ButtonSelect)

ButtonSelect.propTypes = {
    options: PropTypes.any.isRequired,
    onSelect: PropTypes.func.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.any,
    label: PropTypes.string,
    look: PropTypes.string,
    icon: PropTypes.string,
    optionsClassName: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']),
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}

ButtonSelect.defaultProps = {
    placement: 'below'
}
