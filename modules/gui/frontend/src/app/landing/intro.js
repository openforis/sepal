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
                <div className={styles.main}>
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
                </div>
                <div className={[styles.block, styles.dark, styles.imageLeft, styles.responsive].join(' ')}>
                    <img src={image_01} alt=""/>
                    <div>
                        <div className={styles.title}>EASE OF USE</div>
                        <p>Allows users to query and process satellite data quickly and efficiently, tailor their products for local needs, and produce sophisticated and relevant geospatial analyses quickly.</p>
                    </div>
                </div>
                <div className={[styles.block, styles.dark, styles.imageRight, styles.responsive].join(' ')}>
                    <img src={image_02} alt=""/>
                    <div>
                        <div className={styles.title}>COMPUTING POWER</div>
                        <p>
                            Harness high performance cloud-based computing and modern
                            geospatial data infrastructures.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageLeft].join(' ')}>
                    <img src={image_gee} alt='' width={150}/>
                    <div className={styles.tool}>
                        <div className={styles.title}>GOOGLE EARTH ENGINE</div>
                        <p>
                            Get access to Earth Engine's multi-petabyte catalog of satellite
                            imagery and use their planetary-scale analysis capabilities. All
                            without writing a single line of code. Just connect your Google
                            account to SEPAL.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageRight].join(' ')}>
                    <img src={image_jupyter} alt='' width={150}/>
                    <div className={styles.tool}>
                        <div className={styles.title}>JUPYTER NOTEBOOK</div>
                        <p>
                            Run any of the geospatial processing notebooks in SEPAL's
                            catalogue, or develop your own. The hosted Jupyter server
                            comes with Python 3, R, and JavaScript kernels.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageLeft].join(' ')}>
                    <img src={image_shiny} alt='' width={150}/>
                    <div className={styles.tool}>
                        <div className={styles.title}>SHINY SERVER</div>
                        <p>
                            Perform stratified area estimation, time-series analysis
                            with BFAST, and other geospatial processing through the R Shiny
                            apps hosted in SEPAL.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageRight].join(' ')}>
                    <img src={image_rstudio} alt='' width={150}/>
                    <div className={styles.tool}>
                        <div className={styles.title}>RSTUDIO SERVER</div>
                        <p>
                            Develop your R scripts with RStudio, directly inside SEPAL. Use
                            any of the many useful R packages already installed, and install
                            your own when you need to.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.dark, styles.imageLeft, styles.responsive].join(' ')}>
                    <img src={image_03} alt=''/>
                    <div className={styles.tool}>
                        <div className={styles.title}>INTEGRATIONS</div>
                        <p>
                            SEPAL doesn't want to reinvent the wheel. We rather use and integrate with
                            existing solutions, such as Open Foris Collect Earth Online, for visual
                            interpretation of satellite imagery.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.dark, styles.imageRight, styles.responsive].join(' ')}>
                    <img src={image_04} alt=''/>
                    <div>
                        <div className={styles.title}>POWER USERS</div>
                        <p>
                            Get access to dedicated Linux instances, with up to 128 CPU cores, 2TB of RAM
                            and a host of development and geospatial tools installed.
                            Access it directly from within the browser, or an SSH client.
                            Transfer files to and from the instance with rsync, scp, or your favorite
                            FTP client.
                        </p>
                    </div>
                </div>
                <div className={[styles.block, styles.light, styles.imageRight].join(' ')}>
                    <div className={styles.img}>
                        <img src={partner_openforis} alt=''/>
                        <img src={partner_nicfi} alt=''/>
                    </div>
                    <div>
                        <div className={styles.title}>ABOUT</div>
                        <p>SEPAL is an opensource project by the Open Foris team in Forestry Department of the United Nations Food and Agriculture Organization (FAO), funded by the Government of Norway.</p>
                    </div>
                </div>
                <div className={[styles.block, styles.light].join(' ')}>
                    <div className={styles.title}>PARTNERS</div>
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
            </div>
        </Scrollable>
    </ScrollableContainer>

export default Intro
