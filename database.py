import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, URL
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

db_password = os.getenv("DB_PASSWORD")
if db_password is None:
    raise RuntimeError("DB_PASSWORD is missing from .env")

connection_url = URL.create(
    drivername="mysql+pymysql",
    username=os.getenv("DB_USER", "root"),
    password=db_password,
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", "3306")),
    database=os.getenv("DB_NAME", "helpdesk_db"),
)

engine = create_engine(connection_url, pool_pre_ping=True)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
