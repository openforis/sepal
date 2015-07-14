package org.openforis.sepal.scene.retrieval.provider.s3landsat8

import groovy.transform.Immutable

class SceneIndex {
    final List<Entry> entries
    final double sizeInBytes

    SceneIndex(List<Entry> entries) {
        this.entries = Collections.unmodifiableList(entries)
        sizeInBytes = entries.sum { it.sizeInBytes } as double
    }

    int count() {
        entries.size()
    }

    @Immutable
    static class Entry {
        String fileName
        String url
        double sizeInBytes
    }
}
