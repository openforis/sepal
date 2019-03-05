import {collectActivatables as collect} from './activation'
import {toPathList} from 'collections'

/* eslint-disable no-undef */

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

const createActivatable = () => ({random: Math.random()})

const collectActivatables = (state, pathString) =>
    collect(state, toPathList(['activation', pathString.split('.').map(id => ['contexts', id])]))
