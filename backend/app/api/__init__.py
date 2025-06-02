from flask import Blueprint

api = Blueprint('api', __name__)

from . import routes
from .analytics_routes import analytics_bp
from .auth_routes import auth_bp

# Register the Analytics blueprint (for logging Live API usage)
api.register_blueprint(analytics_bp, url_prefix='/analytics')

# Register the Authentication blueprint
api.register_blueprint(auth_bp, url_prefix='/auth') 