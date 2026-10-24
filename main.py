from datetime import date, datetime
import hashlib
import logging
import re
import secrets

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="IT Help Desk & Asset Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TICKET_STATUSES = {"open", "in_progress", "pending", "resolved", "closed"}
PRIORITIES = {"low", "medium", "high", "critical"}
ASSET_STATUSES = {"available", "assigned", "maintenance", "retired"}
USER_ROLES = {"admin", "technician", "employee"}


# ---------- Request validation ----------

class TicketCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str
    category: str = Field(min_length=1, max_length=80)
    priority: str = "medium"
    status: str = "open"
    requester_id: int = Field(gt=0)
    assigned_to: int | None = Field(default=None, gt=0)
    asset_id: int | None = Field(default=None, gt=0)

    @field_validator("title", "category")
    @classmethod
    def required_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class TicketUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, min_length=1, max_length=80)
    priority: str | None = None
    status: str | None = None
    assigned_to: int | None = Field(default=None, gt=0)
    asset_id: int | None = Field(default=None, gt=0)

    @field_validator("title", "category")
    @classmethod
    def valid_optional_text(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("This field cannot be blank.")
        return value


class AssetCreate(BaseModel):
    asset_tag: str = Field(min_length=1, max_length=50)
    asset_type: str = Field(min_length=1, max_length=80)
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    status: str = "available"
    purchase_date: date | None = None
    warranty_expiry: date | None = None

    @field_validator("asset_tag", "asset_type")
    @classmethod
    def required_asset_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("brand", "model", "serial_number")
    @classmethod
    def clean_optional_asset_text(cls, value):
        return value.strip() or None if value is not None else None

    @field_validator("warranty_expiry")
    @classmethod
    def valid_warranty_date(cls, value, info):
        purchase = info.data.get("purchase_date")
        if value and purchase and value < purchase:
            raise ValueError("Warranty expiry cannot precede purchase date.")
        return value


class AssetUpdate(BaseModel):
    asset_tag: str | None = Field(default=None, min_length=1, max_length=50)
    asset_type: str | None = Field(default=None, min_length=1, max_length=80)
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    status: str | None = None
    purchase_date: date | None = None
    warranty_expiry: date | None = None

    @field_validator("asset_tag", "asset_type")
    @classmethod
    def valid_optional_asset_text(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("This field cannot be blank.")
        return value

    @field_validator("brand", "model", "serial_number")
    @classmethod
    def clean_optional_update_text(cls, value):
        return value.strip() or None if value is not None else None


class UserCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8)
    role: str = "employee"
    department_id: int | None = Field(default=None, gt=0)
    is_active: bool = True

    @field_validator("full_name")
    @classmethod
    def valid_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Full name cannot be blank.")
        return value

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address.")
        return value


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, min_length=3, max_length=255)
    role: str | None = None
    department_id: int | None = Field(default=None, gt=0)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)

    @field_validator("full_name")
    @classmethod
    def valid_optional_name(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("Full name cannot be blank.")
        return value

    @field_validator("email")
    @classmethod
    def valid_optional_email(cls, value):
        if value is not None:
            value = value.strip().lower()
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
                raise ValueError("Enter a valid email address.")
        return value


# ---------- Error handling ----------

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        field = ".".join(str(part) for part in error["loc"] if part != "body")
        errors.append({
            "field": field or "request",
            "message": error["msg"].replace("Value error, ", ""),
        })
    return JSONResponse(
        status_code=422,
        content={"detail": errors},
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    logger.exception("Unexpected API error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Please try again."},
    )


# ---------- Database helpers ----------

def rows(query: str, params: dict | None = None):
    try:
        with engine.connect() as connection:
            return [
                dict(row)
                for row in connection.execute(
                    text(query), params or {}
                ).mappings().all()
            ]
    except SQLAlchemyError as exc:
        logger.exception("Database read failed")
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve records from the database.",
        ) from exc


def one(query: str, params: dict | None = None):
    result = rows(query, params)
    return result[0] if result else None


def require_record(table: str, key: str, record_id: int, label: str):
    # Table and key must only be supplied by trusted application code.
    if one(
        f"SELECT {key} FROM {table} WHERE {key} = :record_id",
        {"record_id": record_id},
    ) is None:
        raise HTTPException(
            status_code=404,
            detail=f"{label} ID {record_id} does not exist.",
        )


def validate_related_records(data: dict, include_requester: bool = False):
    if include_requester and data.get("requester_id") is not None:
        require_record("users", "user_id", data["requester_id"], "Requester")

    if data.get("assigned_to") is not None:
        require_record("users", "user_id", data["assigned_to"], "Assigned technician")

    if data.get("asset_id") is not None:
        require_record("assets", "asset_id", data["asset_id"], "Asset")

    if data.get("department_id") is not None:
        require_record("departments", "department_id", data["department_id"], "Department")


def validate_choice(value, allowed, field):
    if value is not None and value not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {field} '{value}'. Allowed values: {', '.join(sorted(allowed))}.",
        )


def execute_insert(query: str, params: dict, conflict_message: str):
    try:
        with engine.begin() as connection:
            result = connection.execute(text(query), params)
            return result.lastrowid
    except IntegrityError as exc:
        logger.warning("Insert constraint violation: %s", exc.orig)
        raise HTTPException(status_code=409, detail=conflict_message) from exc
    except SQLAlchemyError as exc:
        logger.exception("Database insert failed")
        raise HTTPException(
            status_code=500,
            detail="The record could not be saved because of a database error.",
        ) from exc


def execute_update(table, key, record_id, data, allowed_fields):
    data = {k: v for k, v in data.items() if k in allowed_fields}

    if not data:
        raise HTTPException(status_code=400, detail="Provide at least one field to update.")

    if table == "tickets":
        data["updated_at"] = datetime.now()

    assignments = [f"{field} = :{field}" for field in data]
    params = {**data, "record_id": record_id}

    if table == "tickets" and data.get("status") == "resolved":
        assignments.append("resolved_at = COALESCE(resolved_at, :resolved_at)")
        params["resolved_at"] = datetime.now()
    elif table == "tickets" and data.get("status") in {"open", "in_progress", "pending"}:
        assignments.append("resolved_at = NULL")

    try:
        with engine.begin() as connection:
            result = connection.execute(
                text(
                    f"UPDATE {table} SET {', '.join(assignments)} "
                    f"WHERE {key} = :record_id"
                ),
                params,
            )
            if result.rowcount == 0:
                found = connection.execute(
                    text(f"SELECT 1 FROM {table} WHERE {key} = :record_id"),
                    {"record_id": record_id},
                ).first()
                if not found:
                    raise HTTPException(status_code=404, detail=f"{table[:-1].capitalize()} ID {record_id} not found.")
    except HTTPException:
        raise
    except IntegrityError as exc:
        logger.warning("Update constraint violation: %s", exc.orig)
        raise HTTPException(
            status_code=409,
            detail="The update conflicts with existing data. Check duplicate values and related record IDs.",
        ) from exc
    except SQLAlchemyError as exc:
        logger.exception("Database update failed")
        raise HTTPException(
            status_code=500,
            detail="The record could not be updated because of a database error.",
        ) from exc


def delete_record(table, key, record_id, label):
    try:
        with engine.begin() as connection:
            result = connection.execute(
                text(f"DELETE FROM {table} WHERE {key} = :record_id"),
                {"record_id": record_id},
            )
            if result.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail=f"{label} ID {record_id} does not exist.",
                )
    except HTTPException:
        raise
    except IntegrityError as exc:
        logger.warning("Delete constraint violation: %s", exc.orig)
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete this {label.lower()} because other records depend on it. Remove or reassign those records first.",
        ) from exc
    except SQLAlchemyError as exc:
        logger.exception("Database delete failed")
        raise HTTPException(
            status_code=500,
            detail=f"The {label.lower()} could not be deleted because of a database error.",
        ) from exc


# ---------- General ----------

@app.get("/")
def root():
    return {"message": "Help Desk API is running"}


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except SQLAlchemyError as exc:
        logger.exception("Health check failed")
        raise HTTPException(status_code=503, detail="Database is unavailable.") from exc


# ---------- Tickets ----------

@app.get("/tickets")
def get_tickets():
    return rows("""
        SELECT t.*, requester.full_name AS requester,
               technician.full_name AS assigned_technician
        FROM tickets t
        LEFT JOIN users requester ON requester.user_id = t.requester_id
        LEFT JOIN users technician ON technician.user_id = t.assigned_to
        ORDER BY t.created_at DESC
    """)


@app.post("/tickets", status_code=201)
def create_ticket(item: TicketCreate):
    data = item.model_dump()
    validate_choice(data["status"], TICKET_STATUSES, "status")
    validate_choice(data["priority"], PRIORITIES, "priority")
    validate_related_records(data, include_requester=True)

    new_id = execute_insert("""
        INSERT INTO tickets
        (title, description, category, priority, status, requester_id, assigned_to, asset_id)
        VALUES (:title, :description, :category, :priority, :status, :requester_id, :assigned_to, :asset_id)
    """, data, "Ticket could not be created because a related record or value conflicts with existing data.")

    return {"ticket_id": new_id, "message": "Ticket created successfully."}


@app.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: int, update: TicketUpdate):
    if ticket_id <= 0:
        raise HTTPException(status_code=422, detail="Ticket ID must be a positive integer.")

    data = update.model_dump(exclude_unset=True)
    validate_choice(data.get("status"), TICKET_STATUSES, "status")
    validate_choice(data.get("priority"), PRIORITIES, "priority")
    validate_related_records(data)

    execute_update("tickets", "ticket_id", ticket_id, data, {
        "title", "description", "category", "priority", "status", "assigned_to", "asset_id"
    })
    return {"ticket_id": ticket_id, "message": "Ticket updated successfully."}


@app.delete("/tickets/{ticket_id}")
def remove_ticket(ticket_id: int):
    delete_record("tickets", "ticket_id", ticket_id, "Ticket")
    return {"message": "Ticket deleted successfully."}


# ---------- Assets ----------

@app.get("/assets")
def get_assets():
    return rows("SELECT * FROM assets ORDER BY asset_id DESC")


@app.post("/assets", status_code=201)
def create_asset(item: AssetCreate):
    data = item.model_dump()
    validate_choice(data["status"], ASSET_STATUSES, "asset status")

    if data["purchase_date"] and data["warranty_expiry"]:
        if data["warranty_expiry"] < data["purchase_date"]:
            raise HTTPException(status_code=422, detail="Warranty expiry cannot precede purchase date.")

    if one("SELECT asset_id FROM assets WHERE asset_tag = :tag", {"tag": data["asset_tag"]}):
        raise HTTPException(status_code=409, detail=f"Asset tag '{data['asset_tag']}' already exists.")

    if data["serial_number"] and one(
        "SELECT asset_id FROM assets WHERE serial_number = :serial",
        {"serial": data["serial_number"]},
    ):
        raise HTTPException(status_code=409, detail="This serial number is already registered.")

    new_id = execute_insert("""
        INSERT INTO assets
        (asset_tag, asset_type, brand, model, serial_number, status, purchase_date, warranty_expiry)
        VALUES (:asset_tag, :asset_type, :brand, :model, :serial_number, :status, :purchase_date, :warranty_expiry)
    """, data, "Asset could not be created because an asset tag or serial number conflicts with existing data.")

    return {"asset_id": new_id, "message": "Asset created successfully."}


@app.patch("/assets/{asset_id}")
def update_asset(asset_id: int, update: AssetUpdate):
    if asset_id <= 0:
        raise HTTPException(status_code=422, detail="Asset ID must be a positive integer.")

    data = update.model_dump(exclude_unset=True)
    validate_choice(data.get("status"), ASSET_STATUSES, "asset status")

    current = one("SELECT * FROM assets WHERE asset_id = :id", {"id": asset_id})
    if not current:
        raise HTTPException(status_code=404, detail=f"Asset ID {asset_id} does not exist.")

    purchase = data.get("purchase_date", current["purchase_date"])
    warranty = data.get("warranty_expiry", current["warranty_expiry"])
    if purchase and warranty and warranty < purchase:
        raise HTTPException(status_code=422, detail="Warranty expiry cannot precede purchase date.")

    if data.get("asset_tag") and one(
        "SELECT asset_id FROM assets WHERE asset_tag = :tag AND asset_id != :id",
        {"tag": data["asset_tag"], "id": asset_id},
    ):
        raise HTTPException(status_code=409, detail=f"Asset tag '{data['asset_tag']}' already exists.")

    if data.get("serial_number") and one(
        "SELECT asset_id FROM assets WHERE serial_number = :serial AND asset_id != :id",
        {"serial": data["serial_number"], "id": asset_id},
    ):
        raise HTTPException(status_code=409, detail="This serial number is already registered.")

    execute_update("assets", "asset_id", asset_id, data, {
        "asset_tag", "asset_type", "brand", "model", "serial_number", "status",
        "purchase_date", "warranty_expiry"
    })
    return {"asset_id": asset_id, "message": "Asset updated successfully."}


@app.delete("/assets/{asset_id}")
def remove_asset(asset_id: int):
    delete_record("assets", "asset_id", asset_id, "Asset")
    return {"message": "Asset deleted successfully."}


# ---------- Users ----------

@app.get("/users")
def get_users():
    return rows("""
        SELECT user_id, full_name, email, role, department_id, is_active, created_at
        FROM users ORDER BY user_id ASC
    """)


@app.post("/users", status_code=201)
def create_user(item: UserCreate):
    data = item.model_dump()
    validate_choice(data["role"], USER_ROLES, "role")
    validate_related_records(data)

    if one("SELECT user_id FROM users WHERE email = :email", {"email": data["email"]}):
        raise HTTPException(status_code=409, detail=f"Email '{data['email']}' is already registered.")

    salt = secrets.token_hex(16)
    data["password_hash"] = salt + ":" + hashlib.pbkdf2_hmac(
        "sha256", data.pop("password").encode(), salt.encode(), 200_000
    ).hex()

    new_id = execute_insert("""
        INSERT INTO users (full_name, email, password_hash, role, department_id, is_active)
        VALUES (:full_name, :email, :password_hash, :role, :department_id, :is_active)
    """, data, "User could not be created because the email or related department conflicts with existing data.")

    return {"user_id": new_id, "message": "User created successfully."}


@app.patch("/users/{user_id}")
def update_user(user_id: int, update: UserUpdate):
    if user_id <= 0:
        raise HTTPException(status_code=422, detail="User ID must be a positive integer.")

    data = update.model_dump(exclude_unset=True)
    validate_choice(data.get("role"), USER_ROLES, "role")
    validate_related_records(data)

    current = one("SELECT user_id FROM users WHERE user_id = :id", {"id": user_id})
    if not current:
        raise HTTPException(status_code=404, detail=f"User ID {user_id} does not exist.")

    if data.get("email") and one(
        "SELECT user_id FROM users WHERE email = :email AND user_id != :id",
        {"email": data["email"], "id": user_id},
    ):
        raise HTTPException(status_code=409, detail=f"Email '{data['email']}' is already registered.")

    password = data.pop("password", None)
    if password:
        salt = secrets.token_hex(16)
        data["password_hash"] = salt + ":" + hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), 200_000
        ).hex()

    execute_update("users", "user_id", user_id, data, {
        "full_name", "email", "role", "department_id", "is_active", "password_hash"
    })
    return {"user_id": user_id, "message": "User updated successfully."}


@app.delete("/users/{user_id}")
def remove_user(user_id: int):
    delete_record("users", "user_id", user_id, "User")
    return {"message": "User deleted successfully."}


# ---------- Departments, assignments and comments ----------

@app.get("/departments")
def get_departments():
    return rows("SELECT department_id, name FROM departments ORDER BY name")


@app.get("/asset-assignments")
def get_asset_assignments():
    return rows("""
        SELECT aa.*, a.asset_tag, a.asset_type, u.full_name
        FROM asset_assignments aa
        JOIN assets a ON a.asset_id = aa.asset_id
        JOIN users u ON u.user_id = aa.user_id
        ORDER BY aa.assigned_at DESC
    """)


@app.get("/ticket-comments/{ticket_id}")
def get_ticket_comments(ticket_id: int):
    if ticket_id <= 0:
        raise HTTPException(status_code=422, detail="Ticket ID must be a positive integer.")

    require_record("tickets", "ticket_id", ticket_id, "Ticket")

    return rows("""
        SELECT c.*, u.full_name AS author
        FROM ticket_comments c
        LEFT JOIN users u ON u.user_id = c.author_id
        WHERE c.ticket_id = :ticket_id
        ORDER BY c.created_at ASC
    """, {"ticket_id": ticket_id})
