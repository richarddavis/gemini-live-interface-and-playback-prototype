from flask import Blueprint

api = Blueprint('api', __name__)

# Import all route modules to register them
from . import routes
from . import video_creation  
from . import analytics_routes
from . import auth_routes  # Add authentication routes

from .analytics_routes import analytics_bp

# Register the analytics blueprint
api.register_blueprint(analytics_bp, url_prefix='/analytics') 