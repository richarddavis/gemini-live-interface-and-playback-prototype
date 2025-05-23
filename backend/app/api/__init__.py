from flask import Blueprint

api = Blueprint('api', __name__)

from . import routes
from .token import token_bp

# Register the token blueprint
api.register_blueprint(token_bp) 