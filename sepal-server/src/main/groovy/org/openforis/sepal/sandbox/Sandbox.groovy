package org.openforis.sepal.sandbox

class Sandbox {

    String id
    String image
    String name
    State state
    String uri

    Sandbox(String id, String image, String name, State state) {
        this(id)
        this.image = image
        this.name = name
        this.state = state
    }

    Sandbox(String id) { this.id = id }

    Sandbox() {}

    String getImage() { image }

    void setImage(String image) { this.image = image }

    State getState() { return state }

    void setState(State state) { this.state = state }

    String getName() { return name }

    void setName(String name) { this.name = name }

    String getId() { return id }

    void setId(String id) { this.id = id }

    public static class State {

        Boolean Running

        State(Boolean running) { Running = running }

        State() {}

        Boolean getRunning() { return Running }

        void setRunning(Boolean running) { Running = running }

    }

    static def Sandbox mapToObject(def map) {
        Sandbox sandbox = new Sandbox()
        sandbox.id = map.Id
        sandbox.image = map.Image
        sandbox.name = map.Name
        sandbox.state = new State(map.State.Running)
        return sandbox
    }


}
