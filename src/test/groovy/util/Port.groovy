package util

class Port {


    static int findFree() {
        ServerSocket socket = null
        try {
            socket = new ServerSocket(0);
            return socket.localPort
        } finally {
            try {
                socket?.close()
            } catch (IOException ignore) {
            }
        }
    }
}
