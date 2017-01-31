from app import app, http
import config

app.secret_key = config.session_key
app.register_blueprint(http)
