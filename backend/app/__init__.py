from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
import os
from dotenv import load_dotenv

load_dotenv()

db = SQLAlchemy()
migrate = Migrate()

def create_app(config_name=None):
    app = Flask(__name__)
    
    # Load configuration
    if config_name == 'testing':
        from .config import TestingConfig
        app.config.from_object(TestingConfig)
    else:
        from .config import Config
        app.config.from_object(Config)
        
        # Configure the SQLAlchemy part of the app (only for non-testing)
        app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@db:5432/webapp')
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Enable CORS for frontend connections with proper preflight handling
    CORS(app, 
         origins=['http://localhost:3000', 'http://127.0.0.1:3000'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
         allow_headers=['Content-Type', 'Authorization'],
         supports_credentials=True)
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    
    # Create uploads directory (only for non-testing)
    if config_name != 'testing':
        with app.app_context():
            uploads_dir = os.path.join(app.root_path, 'static', 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
    
    # Register blueprints
    from .api import api as api_blueprint
    app.register_blueprint(api_blueprint, url_prefix='/api')

    return app 