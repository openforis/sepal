import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import Label from 'widget/label'
import React from 'react'

const button = label =>
    <Button
        label={label}
        shape='pill'
        look='apply'
        onClick={() => null}
    />

const buttonGroup = layout =>
    <div style={{
        marginTop: '1rem'
    }}>
        <Label msg={layout}/>
        <ButtonGroup layout={layout}>
            {button('A button')}
            {button('Another button')}
            {button('One more button')}
            {button('Yet another button')}
            {button('The last button')}
        </ButtonGroup>
    </div>

const buttonGroupShowcase = () =>
    <React.Fragment>
        {buttonGroup('horizontal-wrap')}
        {buttonGroup('horizontal-wrap-tight')}
        {buttonGroup('horizontal-wrap-spaced')}
        {buttonGroup('horizontal-wrap-fill')}
        {buttonGroup('horizontal-wrap-right')}
        {buttonGroup('horizontal-nowrap')}
        {buttonGroup('horizontal-nowrap-tight')}
        {buttonGroup('horizontal-nowrap-spaced')}
        {buttonGroup('horizontal-nowrap-fill')}
        {buttonGroup('horizontal-nowrap-right')}
        {buttonGroup('vertical')}
        {buttonGroup('vertical-tight')}
    </React.Fragment>

export default buttonGroupShowcase
