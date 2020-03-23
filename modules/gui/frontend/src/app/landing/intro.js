import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {msg} from 'translate'
import React from 'react'
import Tagline from './tagline'
import Title from './title'
import image_01 from './intro/bhutan.jpg'
import image_02 from './intro/senegal.jpg'
import image_03 from './intro/namibia.jpg'
import image_04 from './intro/terminal.jpg'
import image_gee from './intro/tools/gee.png'
import image_jupyter from './intro/tools/jupyter.png'
import image_rstudio from './intro/tools/rstudio.png'
import image_shiny from './intro/tools/shiny.jpg'
import partner_ec from './intro/partners/ec.png'
import partner_esa from './intro/partners/esa.png'
import partner_eth from './intro/partners/eth.png'
import partner_formin from './intro/partners/formin.png'
import partner_germany from './intro/partners/germany.png'
import partner_gfoi from './intro/partners/gfoi.png'
import partner_google from './intro/partners/google.png'
import partner_jaxa from './intro/partners/jaxa.png'
import partner_jica from './intro/partners/jica.png'
import partner_kfw from './intro/partners/kfw.png'
import partner_nasa from './intro/partners/nasa.png'
import partner_nicfi from './intro/partners/nicfi.png'
import partner_openforis from './intro/partners/openforis.png'
import partner_sc from './intro/partners/sc.png'
import partner_servir from './intro/partners/servir.png'
import partner_sig from './intro/partners/sig.png'
import partner_wageningen from './intro/partners/wageningen.png'
import styles from './intro.module.css'

const signupUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSci4hopXNtMOQKJzsUybaJETrAPQp8j6TCqycSBQ0XO37jBwA/viewform?c=0&w=1'

const Intro = ({onLaunch}) =>
    <ScrollableContainer>
        <Scrollable>
            <div className={styles.intro}>
                <Main onLaunch={onLaunch}/>
                <Info/>
                <Footer/>
            </div>
        </Scrollable>
    </ScrollableContainer>

const Main = ({onLaunch}) =>
    <div id='main' className={styles.main}>
        <Title className={styles.title}/>
        <Tagline className={styles.tagline}/>
        <ButtonGroup layout='horizontal-nowrap-loose'>
            <Button
                look='default'
                size='x-large'
                air='more'
                label={msg('landing.signup')}
                tabIndex={1}
                linkUrl={signupUrl}
                linkTarget='_self'
                additionalClassName={styles.button}
            />
            <Button
                type='submit'
                look='apply'
                size='x-large'
                air='more'
                label={msg('landing.launch')}
                tabIndex={2}
                onClick={onLaunch}
                additionalClassName={styles.button}
            />
        </ButtonGroup>
        <div className={styles.nextpage}>
            <Button
                look='transparent'
                shape='circle'
                size='xx-large'
                icon='chevron-down'
                onClick={scrollToInfo}
            />
        </div>
    </div>

const Block = ({style, image, imagePosition, maxImageSize, textKey, responsive, classNames = []}) =>
    <div className={[styles.block, styles[style], styles[imagePosition], responsive ? styles.responsive : null, ...classNames].join(' ')}>
        <img src={image} alt="" style={{maxWidth: maxImageSize}}/>
        <div>
            <div className={styles.title}>{msg(`${textKey}.title`)}</div>
            <p>{msg(`${textKey}.description`)}</p>
        </div>
    </div>

const Info = () =>
    <div id='info'>
        <Block
            style='dark'
            image={image_01}
            imagePosition='left'
            textKey='landing.intro.easeOfUse'
            responsive
        />
        <Block
            style='dark'
            image={image_02}
            imagePosition='right'
            textKey='landing.intro.computingPower'
            responsive
        />
        <Block
            style='light'
            image={image_gee}
            imagePosition='left'
            maxImageSize={150}
            textKey='landing.intro.googleEarthEngine'
        />
        <Block
            style='light'
            image={image_jupyter}
            imagePosition='right'
            maxImageSize={150}
            textKey='landing.intro.jupyterNotebook'
        />
        <Block
            style='light'
            image={image_shiny}
            imagePosition='left'
            maxImageSize={150}
            textKey='landing.intro.shiny'
        />
        <Block
            style='light'
            image={image_rstudio}
            imagePosition='right'
            maxImageSize={150}
            textKey='landing.intro.rstudio'
        />
        <Block
            style='dark'
            image={image_03}
            imagePosition='left'
            textKey='landing.intro.integrations'
            responsive
        />
        <Block
            style='dark'
            image={image_04}
            imagePosition='right'
            textKey='landing.intro.powerUsers'
            responsive
        />
        <About/>
        <Partners/>
    </div>

const About = () =>
    <div className={[styles.block, styles.light, styles.right].join(' ')}>
        <div className={styles.img}>
            <img src={partner_openforis} alt=''/>
            <img src={partner_nicfi} alt=''/>
        </div>
        <div>
            <div className={styles.title}>{msg('landing.intro.about.title')}</div>
            <p>{msg('landing.intro.about.description')}</p>
        </div>
    </div>

const Partners = () =>
    <div className={[styles.block, styles.light].join(' ')}>
        <div className={styles.title}>{msg('landing.intro.partners.title')}</div>
        <div className={[styles.img, styles.partner].join(' ')}>
            <img src={partner_ec} alt=''/>
            <img src={partner_esa} alt=''/>
            <img src={partner_eth} alt=''/>
            <img src={partner_formin} alt=''/>
            <img src={partner_germany} alt=''/>
            <img src={partner_gfoi} alt=''/>
            <img src={partner_google} alt=''/>
            <img src={partner_jaxa} alt=''/>
            <img src={partner_jica} alt=''/>
            <img src={partner_kfw} alt=''/>
            <img src={partner_nasa} alt=''/>
            <img src={partner_sc} alt=''/>
            <img src={partner_servir} alt=''/>
            <img src={partner_sig} alt=''/>
            <img src={partner_wageningen} alt=''/>
        </div>
    </div>

const Footer = () =>
    <div className={styles.footer}>
        <Button
            chromeless
            look='transparent'
            shape='pill'
            size='x-large'
            linkUrl='http://www.openforis.org'
            linkTarget='openforis'
            label='Openforis'>
        </Button>
        <Button
            chromeless
            look='transparent'
            shape='pill'
            size='x-large'
            linkUrl='https://github.com/openforis/sepal'
            linkTarget='github-project'
            label='GitHub'>
        </Button>
        <Button
            chromeless
            look='transparent'
            shape='pill'
            size='x-large'
            linkUrl='/privacy-policy'
            linkTarget='privacy-policy'
            label={msg('landing.privacyPolicy')}>
        </Button>
    </div>

const scrollToInfo = () =>
    document.getElementById('info').scrollIntoView({
        behavior: 'smooth'
    })

export default Intro
