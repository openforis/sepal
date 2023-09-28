const express = require('express')
const session = require('express-session')
const request = require('request')
const urljoin = require('url-join')
const randomColor = require('randomcolor')
const swaggerUi = require('swagger-ui-express')
const bodyParser = require('body-parser')

const config = require('./config')
const swaggerDocument = require('./swagger.json')

const app = express()

app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }))

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.use(session({
    secret: '343ji43j4n3jn4jk3n',
    resave: false,
    saveUninitialized: true
}))

app.use(express.json())

app.use(['/login', '/create-project', '/get-collected-data', '/delete-project', '/get-project-stats'], (req, res, next) => {
    const {ceo: {url, username, password}} = config
    request.post({
        url: urljoin(url, 'login'),
        form: {
            email: username,
            password,
        },
    }).on('response', response => {
        const cookie = response.headers['set-cookie']
        req.session.cookie = cookie
        request.get({
            headers: {
                Cookie: cookie,
            },
            url: urljoin(url, 'account'),
            followRedirect: false,
        }).on('response', response => {
            const {statusCode} = response
            req.loginStatusCode = statusCode !== 302 ? 200 : 403
            req.isLogged = statusCode !== 302 ? true : false
            next()
        }).on('error', err => {
            next(err)
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/login', (req, res, next) => {
    res.sendStatus(req.loginStatusCode)
})

app.post('/create-project', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {session: {cookie}} = req
    const {ceo: {url, institutionId}} = config
    const {classes, plotSize, plots, title, imageryId} = req.body
    if (!Array.isArray(classes) || classes.length === 0
        || typeof plotSize !== 'number' || plotSize < 0
        || !Array.isArray(plots) || plots.length === 0
        || typeof title !== 'string' || title.trim() === ''
        || (imageryId !== undefined && typeof imageryId !== 'number')) {
        return res.status(400).send('Bad Request')
    }
    let csvHeader = Object.keys(plots.reduce((result, obj) => {
        return Object.assign(result, obj)
    }, {})).sort()
    csvHeader.splice(csvHeader.indexOf('lon'), 1)
    csvHeader.splice(csvHeader.indexOf('lat'), 1)
    const plotFile = plots.reduce((acc, curr, i) => {
        const {lon, lat, ...newCurr} = curr
        let csvRecord = `${acc}\n${lon},${lat},${i+1}`
        if (csvHeader.length !== 0) {
            csvHeader.forEach(key => {
                const value = newCurr[key] || ''
                csvRecord = `${csvRecord},${value}`
            })
        }
        return csvRecord
    }, csvHeader.length !== 0 ? `LON,LAT,PLOTID,${csvHeader.join()}` : 'LON,LAT,PLOTID')
    const colors = randomColor({
        count: classes.length,
        hue: 'random',
    })
    const sampleValues = {
        0: {
            question: 'CLASS',
            answers: classes.reduce((accumulator, currentValue, index) => {
                accumulator[index] = {
                    answer: currentValue, 
                    color: colors[index], 
                    hide: false
                }
                return accumulator
            }, {}),
            parentQuestionId: -1,
            parentAnswerIds: [],
            dataType: 'text',
            componentType: 'button',
            cardOrder: 1
        }
    }
    const data = {
        institutionId,
        imageryId: 5,
        description: title,
        institutionId,
        name: title,
        numPlots: '',
        plotDistribution: 'csv',
        plotShape: 'square',
        plotSize: plotSize,
        plotSpacing: '',
        privacyLevel: 'private',
        projectTemplate: '0',
        projectOptions: {
            showGEEScript: false,
            showPlotInformation: false,
            collectConfidence: false,
            autoLaunchGeoDash: true
        }, //Can change based on preferences
        designSettings: {
            userAssignment: {
                userMethod: 'none',
                users: [],
                percents: []
            },
            qaqcAssignment: {
                qaqcMethod: 'none',
                percent: 0,
                smes: [],
                timesToReview: 2
            },
            sampleGeometries: {
                points: true,
                lines: true,
                polygons: true
            }
        },
        sampleDistribution: 'center',
        samplesPerPlot: '',
        sampleResolution: plotSize,
        surveyQuestions: sampleValues,
        surveyRules: [],
        useTemplatePlots: false,
        useTemplateWidgets: false,
        plotFileName: 'plots.csv',
        plotFileBase64: ',' + Buffer.from(plotFile).toString('base64'),
        sampleFileName: '',
        sampleFileBase64: '',
    }
    request.post({
        headers: {
            Cookie: cookie['0'],
        },
        url: urljoin(url, 'create-project'),
        json: data,
    }).on('response', response => {
        const {statusCode} = response
        if (statusCode !== 200) return res.sendStatus(statusCode)
        response.on('data', data => {
            const jsonObject = JSON.parse(data)
            const {projectId, tokenKey, errorMessage} = jsonObject
            const isInteger = n => /^\d+$/.test(n)
            if (!isInteger(projectId)) {
                res.status(400).send({
                    projectId: 0,
                    ceoCollectionUrl: '',
                    errorMessage,
                })
            } else {
                request.post({
                    headers: {
                        Cookie: cookie,
                    },
                    url: urljoin(url, 'publish-project'),
                    qs: {
                        projectId,
                    },
                }).on('response', response => {
                    const ceoCollectionUrl = urljoin(url, 'collection', `?projectId=${projectId}&tokenKey=${tokenKey}`)
                    res.send({
                        projectId,
                        ceoCollectionUrl,
                        errorMessage: '',
                    })
                }).on('error', err => {
                    next(err)
                })
            }
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/get-collected-data/:id', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {session: {cookie}, params: {id}} = req
    const {ceo: {url}} = config
    request.get({
        headers: {
            Cookie: cookie['0'],
        },
        url: urljoin(url, 'get-project-by-id'),
        qs: {
            projectId: id,
        },
    }).on('response', response => {
        const {statusCode} = response
        if (statusCode !== 200) return res.sendStatus(statusCode)
        response.on('data', data => {
            const project = JSON.parse(data.toString())
            const {question, answers} = project.surveyQuestions[0] // surveyQuestions is now an object
            if (!question || !answers) return res.sendStatus(500)
            const answersById = Object.values(answers).reduce((acc, cur) => {
                acc[cur.answer] = cur.id;
                return acc;
              }, {});
            request.get({
                headers: {
                    Cookie: cookie['0'],
                },
                url: urljoin(url, 'dump-project-raw-data'),
                qs: {
                    projectId: id,
                },
            }).on('response', response => {
                let body = ''
                response.on('data', data => {
                    body += data
                }).on('end', () => {
                    const lines = body.toString().split('\n')
                    const header = lines[0].split(',')
                    const qIndex = header.findIndex(ele => ele === question.toUpperCase())
                    const ret = lines.slice(1).reduce((acc, cur) => {
                        const values = cur.split(',')
                        const [id, , yCoord, xCoord] = values
                        const answer = values[qIndex] || ''
                        const answerId = answersById[answer] || ''
                        return `${acc}\n${id},${yCoord},${xCoord},${answerId},${answer}`
                    }, 'id,YCoordinate,XCoordinate,class,editedClass')
                    res.send(ret)
                })
            }).on('error', err => {
                next(err)
            })
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/delete-project/:id', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {session: {cookie}, params: {id}} = req
    const {ceo: {url}} = config
    request.post({
        headers: {
            Cookie: cookie,
        },
        url: urljoin(url, 'archive-project'),
        qs: {
            projectId: id,
        },
    }).on('response', response => {
        const {statusCode} = response
        res.sendStatus(statusCode)
    }).on('error', err => {
        next(err)
    })
})

app.get('/get-project-stats/:id', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {session: {cookie}, params: {id}} = req
    const {ceo: {url}} = config
    request.get({
        headers: {
            Cookie: cookie['0'],
        },
        url: urljoin(url, 'get-project-stats'),
        qs: {
            projectId: id,
        },
    }).on('response', response => {
        const {statusCode} = response
        if (statusCode !== 200) return res.sendStatus(statusCode)
        response.on('data', data => {
            const stats = JSON.parse(data.toString())
            const {unanalyzedPlots, analyzedPlots, flaggedPlots} = stats
            const totalPlotsReviewed = flaggedPlots + analyzedPlots
            const completationPercentage = parseInt((totalPlotsReviewed / (flaggedPlots + analyzedPlots + unanalyzedPlots)) * 100)
            res.send({
                projectId: id,
                unanalyzedPlots,
                analyzedPlots,
                flaggedPlots,
                totalPlotsReviewed,
                completationPercentage,
            })
        })
    }).on('error', err => {
        next(err)
    })
})

app.use((err, req, res, next) => {
    console.info(err.stack)
    res.status(500).send('Something went wrong!')
})

const PORT = process.env.PORT || 3000

app.listen(PORT, function() {
    console.info(`App listening on port ${PORT}!`)
})
