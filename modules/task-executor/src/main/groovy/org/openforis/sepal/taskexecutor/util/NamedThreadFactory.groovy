package org.openforis.sepal.taskexecutor.util

import java.util.concurrent.ThreadFactory
import java.util.concurrent.atomic.AtomicInteger

final class NamedThreadFactory implements ThreadFactory {
    private final ThreadGroup group;
    private final AtomicInteger threadNumber = new AtomicInteger(1);
    private final String namePrefix;
    private final boolean singleThreaded;

    private NamedThreadFactory(String name, boolean singleThreaded) {
        SecurityManager s = System.getSecurityManager();
        group = (s != null) ? s.getThreadGroup() :
                Thread.currentThread().getThreadGroup();
        this.namePrefix = name;
        this.singleThreaded = singleThreaded;
    }

    public Thread newThread(Runnable r) {
        String name = singleThreaded ? namePrefix : namePrefix + "-" + threadNumber.getAndIncrement();
        Thread t = new Thread(group, r, name, 0);
        if (t.isDaemon())
            t.setDaemon(false);
        if (t.getPriority() != Thread.NORM_PRIORITY)
            t.setPriority(Thread.NORM_PRIORITY);
        return t;
    }

    public static NamedThreadFactory singleThreadFactory(String name) {
        return new NamedThreadFactory(name, true);
    }

    public static NamedThreadFactory multipleThreadFactory(String name) {
        return new NamedThreadFactory(name, false);
    }
}

