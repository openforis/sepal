import {Button} from 'widget/button'
import {Input} from 'widget/form'
import {fromEvent} from 'rxjs'
import FloatingBox from 'widget/floatingBox'
import Label from 'widget/label'
import List from 'widget/list'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './yearPicker.module.css'

class YearPicker extends React.Component {
    subscriptions = []
    input = React.createRef()
    list = React.createRef()
    state = {edit: false}

    render() {
        const {className} = this.props
        const {edit} = this.state
        return (
            <div className={[styles.container, className].join(' ')}>
                {this.renderLabel()}
                <div
                    className={styles.input}
                    ref={this.input}>
                    {this.renderInput()}
                    {this.renderTrigger()}
                </div>
                {edit ? this.renderOptions() : null}
            </div>
        )
    }

    renderLabel() {
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
            />
        ) : null
    }

    renderInput() {
        const {input, autoFocus, onChange} = this.props
        return (
            <Input
                input={input}
                maxLength={4}
                autoFocus={autoFocus}
                onClick={() => this.editYear(true)}
                onFocus={() => this.editYear(true)}
                onChange={onChange}
            />
        )
    }

    renderTrigger() {
        const {edit} = this.state
        return (
            <Button additionalClassName={styles.panelTrigger}
                chromeless
                icon='calendar-alt'
                size='small'
                onClick={() => {
                    if (!edit) {
                        this.input.current.focus()
                    }
                    this.editYear(!edit)
                }}/>
        )
    }

    renderOptions() {
        const {input, startYear, endYear, portal, placement = 'below'} = this.props
        return (
            <FloatingBox
                ref={this.list}
                element={this.input.current}
                placement={placement}>
                <YearPickerControl
                    startYear={startYear}
                    endYear={endYear}
                    input={input}
                    close={() => this.close()}
                    portal={portal}
                />
            </FloatingBox>
        )
    }

    close() {
        this.editYear(false)
    }

    editYear(edit) {
        this.setState({edit})
        if (!edit) {
            const {onChange, input} = this.props
            onChange && onChange(input.value)
        }
    }

    handleBlurEvents() {
        const click$ = fromEvent(document, 'click')
        const isInputClick = e => this.input.current && this.input.current.contains(e.target)
        this.subscriptions.push(
            click$.subscribe(e => !isInputClick(e) && this.close())
        )
    }

    componentDidMount() {
        this.handleBlurEvents()
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

YearPicker.propTypes = {
    autoFocus: PropTypes.any,
    className: PropTypes.string,
    endYear: PropTypes.any,
    input: PropTypes.object,
    placement: PropTypes.string,
    portal: PropTypes.object,
    startYear: PropTypes.any,
    year: PropTypes.object,
    onChange: PropTypes.func
}

export class YearPickerControl extends React.Component {
    selectYear(year) {
        const {input, close} = this.props
        input.set(year)
        close()
    }

    render() {
        const {startYear, endYear, input, close} = this.props
        const years = _.range(Number(startYear), Number(endYear) + 1)
        const options = years.map(year =>
            ({label: year, value: year})
        )
        const selectedOption = options.find(option => option.value === input.value)
        return (
            <List
                className={styles.list}
                options={options}
                selectedOption={selectedOption}
                onSelect={option => this.selectYear(option.value)}
                onCancel={close}
                overScroll
            />
        )
    }
}

YearPickerControl.propTypes = {
    close: PropTypes.func,
    date: PropTypes.object,
    endYear: PropTypes.any,
    input: PropTypes.object,
    portal: PropTypes.object,
    resolution: PropTypes.string,
    startYear: PropTypes.any
}

export default YearPicker
