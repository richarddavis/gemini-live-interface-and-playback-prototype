from flask import Blueprint

api = Blueprint('api', __name__)

from . import routes
from .token import token_bp
from .live_api_routes import live_api_bp

# Register the token blueprint
api.register_blueprint(token_bp)

# Register the Live API blueprint
api.register_blueprint(live_api_bp) 