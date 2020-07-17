import {Panel} from 'widget/panel/panel'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './appDetails.module.css'

export const AppDetails = props => {
    const {app, onClose} = props
    return (
        <Panel className={styles.panel} type='modal'>
            <Panel.Header
                icon='layer-group'
                title={app.label}/>
            <Panel.Content
                scrollable={true}
                noVerticalPadding
                className={styles.panelContent}>
                <div>
                    {app.description}
                </div>
                <div>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla nibh dui, dictum ac efficitur eget,
                    fermentum et dui. Ut rhoncus scelerisque lectus, vitae dictum leo sodales sit amet.
                    Curabitur faucibus, purus euismod ultricies pulvinar, tortor ipsum semper ipsum,
                    sed semper ligula turpis quis velit. Maecenas laoreet feugiat pharetra. Ut sed commodo urna.
                    Vivamus luctus suscipit nulla, in dictum enim semper vel. Ut auctor mollis condimentum.
                    Quisque lacinia odio ipsum, eu laoreet lacus venenatis ac. Donec maximus laoreet massa pulvinar congue.
                    Etiam sit amet massa ligula. Praesent lacinia lorem quis ex efficitur aliquet.
                    Donec eget nulla eget sem blandit tincidunt. Nullam non magna eu magna maximus bibendum eget et elit.
                    Nulla ante purus, posuere in risus vel, posuere tristique metus.
                    Integer iaculis mattis vehicula. Nunc placerat est tortor, ac luctus dui convallis id.
                    Curabitur vel velit mi.
                    Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.
                    Suspendisse nec ante sit amet nisl mattis accumsan at in ipsum.
                    Integer efficitur scelerisque neque nec congue.
                    Duis ut nulla sit amet ex consectetur gravida at nec augue.
                    Nunc non condimentum velit.
                    Curabitur commodo, nisi ac molestie vestibulum, tortor risus porttitor nisi,
                    interdum porta purus nibh ut sapien.
                </div>
            </Panel.Content>
            <Panel.Buttons onEnter={onClose} onEscape={onClose}>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Close onClick={onClose}/>
                </Panel.Buttons.Main>
            </Panel.Buttons>
        </Panel>
    )
}

AppDetails.propTypes = {
    app: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired
}
