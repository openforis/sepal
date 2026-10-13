import {toPathList} from '~/stateUtils'

import {collectActivatables as collect} from './activation'

it('Given no activatables, an empty object is returned', () => {
    expect(collectActivatables({
        activation: {
            contexts: {
                root: {}
            }
        }
    }, 'root')).toEqual({})
})

it('Given a single context with an activatable, object with the activatable is returned', () => {
    const aRootActivatable = createActivatable()

    expect(collectActivatables({
        activation: {
            contexts: {
                root: {
                    activatables: {
                        aRootActivatable
                    }
                }
            }

        }
    }, 'root')).toEqual({aRootActivatable})
})

it('Given a context with a parent context, object with activatables from both contexts is returned', () => {
    const aRootActivatable = createActivatable()
    const activatable = createActivatable()

    expect(collectActivatables({
        activation: {
            contexts: {
                root: {
                    activatables: {
                        aRootActivatable
                    },
                    contexts: {
                        aContext: {
                            activatables: {
                                activatable
                            }
                        }
                    }
                }
            }

        }
    }, 'root.aContext')).toEqual({aRootActivatable, activatable})
})

it('Given a context with two parent contexts, object with activatables from all contexts is returned', () => {
    const aRootActivatable = createActivatable()
    const activatable = createActivatable()
    const aChildActivatable = createActivatable()

    expect(collectActivatables({
        activation: {
            contexts: {
                root: {
                    activatables: {
                        aRootActivatable
                    },
                    contexts: {
                        aContext: {
                            activatables: {
                                activatable
                            },
                            contexts: {
                                aChildContext: {
                                    activatables: {
                                        aChildActivatable
                                    }
                                }
                            }
                        }
                    }
                }
            }

        }
    }, 'root.aContext.aChildContext')).toEqual({aRootActivatable, activatable, aChildActivatable})
})

it('Given a context with a child context, object with activatables from both contexts is returned', () => {
    const aRootActivatable = createActivatable()
    const activatable = createActivatable()

    expect(collectActivatables({
        activation: {
            contexts: {
                root: {
                    activatables: {
                        aRootActivatable
                    },
                    contexts: {
                        aContext: {
                            activatables: {
                                activatable
                            }
                        }
                    }
                }
            }

        }
    }, 'root')).toEqual({aRootActivatable, activatable})
})

it('Given a context with two child contexts, object with activatables from all contexts is returned', () => {
    const aRootActivatable = createActivatable()
    const activatableA = createActivatable()
    const activatableB = createActivatable()

    expect(collectActivatables({
        activation: {
            contexts: {
                root: {
                    activatables: {
                        aRootActivatable
                    },
                    contexts: {
                        aContext: {
                            activatables: {
                                activatableA
                            }
                        },
                        bContext: {
                            activatables: {
                                activatableB
                            }
                        },
                    }
                }
            }

        }
    }, 'root')).toEqual({aRootActivatable, activatableA, activatableB})
})

it('Given a context with child and grand-child contexts, object with activatables from all contexts is returned', () => {
    const aRootActivatable = createActivatable()
    const activatableA = createActivatable()
    const activatableB = createActivatable()

    expect(collectActivatables({
        activation: {
            contexts: {
                root: {
                    activatables: {
                        aRootActivatable
                    },
                    contexts: {
                        aContext: {
                            activatables: {
                                activatableA
                            },
                            contexts: {
                                bContext: {
                                    activatables: {
                                        activatableB
                                    }
                                }
                            }
                        }
                    }
                }
            }

        }
    }, 'root')).toEqual({aRootActivatable, activatableA, activatableB})
})

it('Given a context and sibling context, activatables from sibling context is not included', () => {
    const activatable = createActivatable()
    const siblingActivatable = createActivatable()

    expect(collectActivatables({
        activation: {
            contexts: {
                root: {
                    contexts: {
                        context: {
                            activatables: {
                                activatable
                            }
                        },
                        siblingContext: {
                            activatables: {
                                siblingActivatable
                            }
                        }
                    }
                }
            }

        }
    }, 'root.context')).toEqual({activatable})
})

it('Given a context with a parent and parent-sibling context, activatables from parent-sibling is not included', () => {
    const activatable = createActivatable()
    const unwantedActivatable = createActivatable()

    expect(collectActivatables({
        activation: {
            contexts: {
                root: {
                    contexts: {
                        parentContext: {
                            contexts: {
                                context: {
                                    activatables: {
                                        activatable
                                    }
                                }
                            }
                        },
                        unwontedContext: {
                            activatables: {
                                unwantedActivatable
                            }
                        }
                    }
                }
            }

        }
    }, 'root.parentContext.context')).toEqual({activatable})
})

describe('collecting a context again', () => {
    it('reuses the result while the activation state is the same, whatever else in the state changed', () => {
        const activation = {contexts: {root: {activatables: {panel: createActivatable()}}}}
        const collected = collectActivatables({activation, stream: {load: 'ACTIVE'}}, 'root')

        expect(collectActivatables({activation, stream: {load: 'COMPLETED'}}, 'root')).toBe(collected)
    })

    it('collects each context of the same activation state on its own', () => {
        const rootPanel = createActivatable()
        const recipePanel = createActivatable()
        const activation = {contexts: {root: {activatables: {rootPanel}, contexts: {recipe: {activatables: {recipePanel}}}}}}

        const ofRecipe = collectActivatables({activation}, 'root.recipe')
        const ofRoot = collectActivatables({activation}, 'root')

        expect(ofRecipe).toEqual({rootPanel, recipePanel})
        expect(ofRoot).toEqual({rootPanel, recipePanel})
        expect(ofRoot).not.toBe(ofRecipe)
        expect(collectActivatables({activation}, 'root.recipe')).toBe(ofRecipe)
    })

    it('keeps apart a context whose id reads like a nested path when joined', () => {
        const flat = createActivatable()
        const nested = createActivatable()
        const activation = {contexts: {root: {contexts: {
            'x,contexts,y': {activatables: {flat}},
            x: {contexts: {y: {activatables: {nested}}}}
        }}}}
        const state = {activation}
        const root = ['activation', 'contexts', 'root', 'contexts']

        expect(collect(state, [...root, 'x', 'contexts', 'y'])).toEqual({nested})
        expect(collect(state, [...root, 'x,contexts,y'])).toEqual({flat})
    })

    it('collects again once the activation state is replaced', () => {
        const panel = createActivatable()
        const opened = {...createActivatable(), active: true}
        const collected = collectActivatables({activation: {contexts: {root: {activatables: {panel}}}}}, 'root')

        const recollected = collectActivatables({activation: {contexts: {root: {activatables: {panel, opened}}}}}, 'root')

        expect(recollected).toEqual({panel, opened})
        expect(collected).toEqual({panel})
    })

    it('collects nothing, every time, from a state without activation', () => {
        expect(collectActivatables({}, 'root')).toEqual({})
        expect(collectActivatables({}, 'root')).toEqual({})
    })
})

const createActivatable = () => ({random: Math.random()})

const collectActivatables = (state, pathString) =>
    collect(state, toPathList(['activation', pathString.split('.').map(id => ['contexts', id])]))
