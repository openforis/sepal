package util

import groovy.xml.MarkupBuilder

class DirectoryStructure {
    public static matches(File directory, Closure expectedStructure) {
        def expectation = dirStructure(expectedStructure)

        def actual = toXml(directory)
        assert expectation == actual
        return true
    }

    private static String toXml(File dir) {
        def writer = new StringWriter()
        def builder = new MarkupBuilder(writer)

        builder.dir {
            appendToBuilder(dir, builder)
        }
        writer.toString()
    }

    private static void appendToBuilder(File dir, MarkupBuilder builder) {
        dir.eachFile { file ->
            delegate = builder
            if (file.isDirectory())
                "$file.name" {
                    appendToBuilder(file, builder)
                }
            else
                "$file.name"()
        }
    }

    private static String dirStructure(Closure expectedStructure) {
        def writer = new StringWriter()
        def builder = new MarkupBuilder(writer)
        expectedStructure.delegate = builder
        builder.dir() {
            expectedStructure()
        }
        def expectation = writer.toString()
        expectation
    }

}
