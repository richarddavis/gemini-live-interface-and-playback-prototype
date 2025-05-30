from flask import Blueprint

api = Blueprint('api', __name__)

from . import routes
from .analytics_routes import analytics_bp

# Register the Analytics blueprint (for logging Live API usage)
api.register_blueprint(analytics_bp, url_prefix='/analytics') 