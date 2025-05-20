from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line set up loggers basically.
import os
alembic_ini_path = os.path.join(os.path.dirname(__file__), '..', 'alembic.ini')
if os.path.exists(alembic_ini_path):
    fileConfig(alembic_ini_path)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
# For Flask-SQLAlchemy, the metadata is on db.metadata
from app import db as application_db # Import your db instance from your app package

# Get the database URL from the Flask app's configuration if possible,
# otherwise Alembic will use the URL from alembic.ini if set directly there.
# We need to ensure the Flask app is configured enough for db.engine to be available.
# A common pattern is to have create_app() configure the db, and then alembic imports the db object.

# If your Flask app is structured to be imported and db.engine is available:
if hasattr(application_db, 'engine') and application_db.engine is not None:
    # Configure the sqlalchemy.url for Alembic from the Flask app's bound engine
    # This ensures Alembic uses the same database as your Flask app
    db_url = application_db.engine.url.render_as_string(hide_password=False)
    config.set_main_option('sqlalchemy.url', db_url)
else:
    # Fallback or warning if db.engine is not configured/bound when env.py is loaded
    # This might happen if create_app() hasn't been effectively called and configured the db yet
    # in the context Alembic loads env.py. For `flask db` commands, Flask CLI should handle app context.
    # If alembic.ini has sqlalchemy.url, it might be used as a fallback by engine_from_config.
    pass

target_metadata = application_db.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:-
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online() 