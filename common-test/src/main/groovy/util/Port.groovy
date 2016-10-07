package util

import java.util.concurrent.ConcurrentHashMap

class Port {
    static recentlyUsed = new ConcurrentHashMap()

    static int findFree() {
        int port = 0
        while (!port) {
            ServerSocket socket = null
            try {
                socket = new ServerSocket(0);
                port = socket.localPort
                if (recentlyUsed.containsKey(port)) {
                    port = 0
                } else
                    recentlyUsed.put(port, 0)
            } finally {
                try {
                    socket?.close()
                } catch (IOException ignore) {
                }
            }
        }
        return port
    }
}
