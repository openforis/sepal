from flask import Flask, send_from_directory

app = Flask(__name__, instance_relative_config=True)


@app.route('/')
def index():
    return send_from_directory('test-frontend', 'index.html')


if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=6776,
        threaded=True
    )
