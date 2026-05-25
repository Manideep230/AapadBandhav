import os
import re
import math
import uuid
import json
import datetime
import sys
import bcrypt
import jwt
from functools import wraps
from threading import Thread

from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from sqlalchemy import (
    create_engine, Column, String, Integer, Float, Boolean, DateTime,
    Text, ForeignKey, Numeric, Enum, JSON, or_, and_, desc
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Initialize Firebase Admin SDK if credentials exist
try:
    import firebase_admin
    from firebase_admin import credentials
    firebase_project_id = os.getenv("FIREBASE_PROJECT_ID")
    firebase_private_key = os.getenv("FIREBASE_PRIVATE_KEY")
    firebase_client_email = os.getenv("FIREBASE_CLIENT_EMAIL")

    if firebase_project_id and firebase_private_key and firebase_client_email:
        private_key = firebase_private_key.replace('\\n', '\n')
        # Automatically recover newline characters corrupted during copy-paste (e.g. \L -> \nL, \K -> \nK)
        private_key = private_key.replace('\\L', '\nL').replace('\\K', '\nK')
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": firebase_project_id,
            "private_key": private_key,
            "client_email": firebase_client_email,
            "token_uri": "https://oauth2.googleapis.com/token"
        })
        firebase_admin.initialize_app(cred)
        print("Firebase Admin SDK initialized successfully.")
except Exception as e:
    print(f"Error initializing Firebase Admin SDK: {e}")

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv("JWT_SECRET", "change_this_to_a_minimum_64_char_random_secret_in_production")

import re

# CORS Setup
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [o.strip() for o in allowed_origins_str.split(",") if o.strip()]

# Compile regex patterns to match local host, vercel and devtunnels dynamically
cors_patterns = [
    re.compile(r"^https?://localhost(:\d+)?$"),
    re.compile(r"^https?://.*\.vercel\.app$"),
    re.compile(r"^https?://.*\.devtunnels\.ms$")
]

# Add any custom explicit origins from environment variable
for origin in allowed_origins:
    try:
        cors_patterns.append(re.compile(f"^{re.escape(origin)}$"))
    except Exception:
        pass

def check_cors_origin(origin):
    if not origin:
        return False
    for pattern in cors_patterns:
        if pattern.match(origin):
            return True
    return False

CORS(app, resources={r"/api/*": {"origins": cors_patterns}}, supports_credentials=True)

# Socket.IO Setup
socketio = SocketIO(app, cors_allowed_origins=check_cors_origin, async_mode='threading')

# ─── Database Configuration ──────────────────────────────────────────────────
class MongoQuery:
    def __init__(self, model_class, db):
        self.model_class = model_class
        self.collection = db[model_class.__tablename__]
        self.db = db
        self.filters = []
        self.order_by_fields = []
        self.limit_val = None
        self.offset_val = None

    def filter(self, *criterion):
        for crit in criterion:
            if crit is not None:
                self.filters.append(crit)
        return self

    def order_by(self, *criterion):
        for crit in criterion:
            if crit is not None:
                self.order_by_fields.append(crit)
        return self

    def limit(self, val):
        self.limit_val = val
        return self

    def offset(self, val):
        self.offset_val = val
        return self

    def _build_filter(self):
        from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList, UnaryExpression
        
        def to_mongo_query(expr):
            if expr is None: return {}
            if isinstance(expr, bool): return {}
            
            if isinstance(expr, BooleanClauseList):
                op_name = getattr(expr.operator, '__name__', '')
                clauses = [to_mongo_query(c) for c in expr.clauses]
                if 'or_' in op_name:
                    return {"$or": [c for c in clauses if c]}
                else:
                    merged = {}
                    for c in clauses:
                        for k, v in c.items():
                            if k in merged:
                                if isinstance(merged[k], dict) and isinstance(v, dict):
                                    merged[k].update(v)
                                else:
                                    if "$and" not in merged:
                                        merged["$and"] = []
                                    merged["$and"].append({k: v})
                            else:
                                merged[k] = v
                    return merged

            if isinstance(expr, BinaryExpression):
                left = expr.left
                right = expr.right
                op_name = getattr(expr.operator, '__name__', '')
                field_name = getattr(left, 'name', None)
                if not field_name: return {}
                
                val = None
                if hasattr(right, 'value'):
                    val = right.value
                elif hasattr(right, 'element') and hasattr(right.element, 'value'):
                    val = right.element.value
                else:
                    val = right

                val_class = val.__class__.__name__
                if val_class == 'True_': val = True
                elif val_class == 'False_': val = False
                elif val_class == 'Null' or val_class == 'None_': val = None

                if 'eq' in op_name:
                    return {field_name: val}
                elif 'ne' in op_name:
                    return {field_name: {"$ne": val}}
                elif 'lt' in op_name:
                    return {field_name: {"$lt": val}}
                elif 'le' in op_name:
                    return {field_name: {"$lte": val}}
                elif 'gt' in op_name:
                    return {field_name: {"$gt": val}}
                elif 'ge' in op_name:
                    return {field_name: {"$gte": val}}
                elif 'in_op' in op_name:
                    if hasattr(val, 'clauses'):
                        val_list = [c.value if hasattr(c, 'value') else c for c in val.clauses]
                    else:
                        val_list = val
                    resolved = []
                    for it in (val_list if isinstance(val_list, (list, tuple, set)) else [val_list]):
                        it_cls = it.__class__.__name__
                        if it_cls == 'True_': resolved.append(True)
                        elif it_cls == 'False_': resolved.append(False)
                        elif it_cls == 'Null' or it_cls == 'None_': resolved.append(None)
                        else: resolved.append(it)
                    return {field_name: {"$in": resolved}}
                elif 'not_in_op' in op_name:
                    if hasattr(val, 'clauses'):
                        val_list = [c.value if hasattr(c, 'value') else c for c in val.clauses]
                    else:
                        val_list = val
                    resolved = []
                    for it in (val_list if isinstance(val_list, (list, tuple, set)) else [val_list]):
                        it_cls = it.__class__.__name__
                        if it_cls == 'True_': resolved.append(True)
                        elif it_cls == 'False_': resolved.append(False)
                        elif it_cls == 'Null' or it_cls == 'None_': resolved.append(None)
                        else: resolved.append(it)
                    return {field_name: {"$nin": resolved}}
                else:
                    return {field_name: val}
            return {}

        query_dict = {}
        for f in self.filters:
            q = to_mongo_query(f)
            for k, v in q.items():
                if k in query_dict:
                    if isinstance(query_dict[k], dict) and isinstance(v, dict):
                        query_dict[k].update(v)
                    else:
                        if "$and" not in query_dict:
                            query_dict["$and"] = []
                        query_dict["$and"].append({k: v})
                else:
                    query_dict[k] = v
        return query_dict

    def _execute(self):
        query_dict = self._build_filter()
        cursor = self.collection.find(query_dict)
        
        if self.order_by_fields:
            from sqlalchemy.sql.elements import UnaryExpression
            sort_list = []
            for field in self.order_by_fields:
                if isinstance(field, UnaryExpression):
                    modifier_name = getattr(field.modifier, '__name__', '')
                    col_name = getattr(field.element, 'name', None)
                    if col_name:
                        direction = -1 if 'desc' in modifier_name else 1
                        sort_list.append((col_name, direction))
                else:
                    col_name = getattr(field, 'name', None)
                    if col_name:
                        sort_list.append((col_name, 1))
            if sort_list:
                cursor = cursor.sort(sort_list)

        if self.limit_val is not None:
            cursor = cursor.limit(self.limit_val)

        if self.offset_val is not None:
            cursor = cursor.skip(self.offset_val)
            
        return cursor

    def _document_to_instance(self, doc):
        if doc is None:
            return None
        doc.pop('_id', None)
        instance = self.model_class()
        
        # Populate columns from stored document values.
        # Only apply scalar defaults on read (e.g. 'Car', True).
        # Callable defaults (UUID generators, datetime.utcnow) are NOT applied
        # on read — they would overwrite real data with freshly generated values.
        for col in self.model_class.__mapper__.columns:
            val = doc.get(col.name)
            if val is None and col.default is not None:
                if col.default.is_scalar:
                    val = col.default.arg
            setattr(instance, col.name, val)
            
        # Keep any other fields in the document not mapped to columns
        for k, v in doc.items():
            if not hasattr(instance, k):
                setattr(instance, k, v)
                
        return instance

    def first(self):
        docs = list(self._execute().limit(1))
        if docs:
            return self._document_to_instance(docs[0])
        return None

    def all(self):
        docs = list(self._execute())
        return [self._document_to_instance(doc) for doc in docs]

    def count(self):
        query_dict = self._build_filter()
        return self.collection.count_documents(query_dict)

    def delete(self):
        query_dict = self._build_filter()
        self.collection.delete_many(query_dict)

    def update(self, values):
        query_dict = self._build_filter()
        update_dict = {}
        if isinstance(values, dict):
            for k, v in values.items():
                k_str = k.name if hasattr(k, 'name') else str(k)
                update_dict[k_str] = v
        else:
            for k, v in values:
                k_str = k.name if hasattr(k, 'name') else str(k)
                update_dict[k_str] = v
        self.collection.update_many(query_dict, {"$set": update_dict})

class MongoSession:
    def __init__(self, db):
        self.db = db
        self.pending_instances = []

    def query(self, model_class):
        return MongoQuery(model_class, self.db)

    def add(self, instance):
        if instance not in self.pending_instances:
            self.pending_instances.append(instance)

    def delete(self, instance):
        if hasattr(instance, '__tablename__'):
            coll = self.db[instance.__tablename__]
            if hasattr(instance, 'id') and instance.id:
                coll.delete_one({"id": instance.id})

    def commit(self):
        for instance in self.pending_instances:
            if hasattr(instance, '__tablename__'):
                coll = self.db[instance.__tablename__]
                data = {}
                for col in instance.__class__.__mapper__.columns:
                    val = getattr(instance, col.name, None)
                    if val is None and col.default is not None:
                        if col.default.is_scalar:
                            val = col.default.arg
                        elif col.default.is_callable:
                            val = col.default.arg(None)
                        # Apply the resolved default back to the in-memory instance
                        # so callers can read the value after commit (e.g. user.role)
                        setattr(instance, col.name, val)
                            
                    if isinstance(val, datetime.datetime):
                        pass
                    elif isinstance(val, (datetime.date, datetime.time)):
                        val = str(val)
                    elif val.__class__.__name__ == 'Decimal':
                        val = float(val)
                    data[col.name] = val
                
                if hasattr(instance, 'id') and instance.id:
                    coll.replace_one({"id": instance.id}, data, upsert=True)
                else:
                    if not getattr(instance, 'id', None):
                        instance.id = str(uuid.uuid4())
                        data['id'] = instance.id
                    coll.insert_one(data)
        self.pending_instances = []

    def flush(self):
        self.commit()

    def rollback(self):
        pass

    def close(self):
        pass

DB_DIALECT = os.getenv("DB_DIALECT", "sqlite")
if DB_DIALECT == "mongodb":
    from pymongo import MongoClient
    import urllib.parse
    mongo_uri = os.getenv("MONGODB_URI", "mongodb+srv://manideep:manideep@cluster0.rtoosny.mongodb.net/")
    parsed_uri = urllib.parse.urlparse(mongo_uri)
    db_name = parsed_uri.path.strip("/")
    if not db_name:
        db_name = "aapadbandhav"
    mongo_client = MongoClient(mongo_uri)
    mongo_db = mongo_client[db_name]
    print(f"MongoDB connected to database: {db_name}")
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SessionLocal = lambda: MongoSession(mongo_db)
else:
    if DB_DIALECT == "postgres":
        db_uri = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'postgres')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'aapadbandhav_db')}"
    else:
        db_uri = "sqlite:///database.sqlite"
    engine = create_engine(db_uri, connect_args={"check_same_thread": False} if "sqlite" in db_uri else {})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Context-local DB session helper
def get_db():
    if 'db' not in g:
        g.db = SessionLocal()
    return g.db

@app.teardown_appcontext
def teardown_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# ─── Database Models ──────────────────────────────────────────────────────────

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = 'users'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    unique_id = Column(String(10), unique=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    mobile = Column(String(15), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    vehicle_number = Column(String(20), nullable=True)
    vehicle_type = Column(String(20), default='Car')
    address = Column(Text, nullable=True)
    blood_group = Column(String(20), default='Unknown')
    age = Column(Integer, nullable=True)
    gender = Column(String(50), default='Prefer not to say')
    profile_photo = Column(String(500), nullable=True)
    role = Column(String(20), default='user')
    is_active = Column(Boolean, default=True)
    last_location_lat = Column(Numeric(10, 8), nullable=True)
    last_location_lng = Column(Numeric(11, 8), nullable=True)
    last_seen = Column(DateTime, nullable=True)
    fcm_token = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "unique_id": self.unique_id,
            "full_name": self.full_name,
            "email": self.email,
            "mobile": self.mobile,
            "vehicle_number": self.vehicle_number,
            "vehicle_type": self.vehicle_type,
            "address": self.address,
            "blood_group": self.blood_group,
            "age": self.age,
            "gender": self.gender,
            "profile_photo": self.profile_photo,
            "role": self.role,
            "is_active": self.is_active,
            "last_location_lat": float(self.last_location_lat) if self.last_location_lat else None,
            "last_location_lng": float(self.last_location_lng) if self.last_location_lng else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "fcm_token": self.fcm_token
        }

class Device(Base):
    __tablename__ = 'devices'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(16), unique=True, nullable=False)
    qr_code = Column(String(100), nullable=True)
    owner_id = Column(String(36), ForeignKey('users.id'), nullable=True)
    is_active = Column(Boolean, default=True)
    is_linked = Column(Boolean, default=False)
    linked_at = Column(DateTime, nullable=True)
    firmware_version = Column(String(20), default='1.0.0')
    last_ping = Column(DateTime, nullable=True)
    battery_level = Column(Integer, default=100)
    status = Column(String(50), default='active')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "qr_code": self.qr_code,
            "owner_id": self.owner_id,
            "is_active": self.is_active,
            "is_linked": self.is_linked,
            "linked_at": self.linked_at.isoformat() if self.linked_at else None,
            "firmware_version": self.firmware_version,
            "last_ping": self.last_ping.isoformat() if self.last_ping else None,
            "battery_level": self.battery_level,
            "status": self.status
        }

class Hospital(Base):
    __tablename__ = 'hospitals'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    mobile = Column(String(15), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=False)
    longitude = Column(Numeric(11, 8), nullable=False)
    specializations = Column(JSON, default=list)
    bed_capacity = Column(Integer, default=0)
    available_beds = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    is_available = Column(Boolean, default=True)
    registration_number = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    fcm_token = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "latitude": float(self.latitude),
            "longitude": float(self.longitude),
            "specializations": self.specializations,
            "bed_capacity": self.bed_capacity,
            "available_beds": self.available_beds,
            "is_active": self.is_active,
            "is_available": self.is_available,
            "registration_number": self.registration_number,
            "city": self.city,
            "state": self.state,
            "fcm_token": self.fcm_token
        }

class AmbulanceDriver(Base):
    __tablename__ = 'ambulance_drivers'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    mobile = Column(String(15), nullable=True)
    license_number = Column(String(100), nullable=True)
    vehicle_number = Column(String(50), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    is_available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime, nullable=True)
    fcm_token = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "license_number": self.license_number,
            "vehicle_number": self.vehicle_number,
            "latitude": float(self.latitude) if self.latitude else None,
            "longitude": float(self.longitude) if self.longitude else None,
            "is_available": self.is_available,
            "is_active": self.is_active,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "fcm_token": self.fcm_token
        }

class PoliceStation(Base):
    __tablename__ = 'police_stations'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    mobile = Column(String(15), nullable=True)
    station_code = Column(String(50), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    is_available = Column(Boolean, default=True)
    fcm_token = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "station_code": self.station_code,
            "latitude": float(self.latitude) if self.latitude else None,
            "longitude": float(self.longitude) if self.longitude else None,
            "address": self.address,
            "city": self.city,
            "state": self.state,
            "is_active": self.is_active,
            "is_available": self.is_available,
            "fcm_token": self.fcm_token
        }

class Policeman(Base):
    __tablename__ = 'policemen'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    mobile = Column(String(15), nullable=True)
    badge_number = Column(String(50), nullable=True)
    station_id = Column(String(36), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    is_available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime, nullable=True)
    fcm_token = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "badge_number": self.badge_number,
            "station_id": self.station_id,
            "latitude": float(self.latitude) if self.latitude else None,
            "longitude": float(self.longitude) if self.longitude else None,
            "is_available": self.is_available,
            "is_active": self.is_active,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "fcm_token": self.fcm_token
        }

class Mechanic(Base):
    __tablename__ = 'mechanics'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    mobile = Column(String(15), nullable=True)
    specialization = Column(String(200), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    is_available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime, nullable=True)
    rating = Column(Float, default=4.0)
    fcm_token = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "specialization": self.specialization,
            "latitude": float(self.latitude) if self.latitude else None,
            "longitude": float(self.longitude) if self.longitude else None,
            "is_available": self.is_available,
            "is_active": self.is_active,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "rating": self.rating,
            "fcm_token": self.fcm_token
        }

class InsuranceCompany(Base):
    __tablename__ = 'insurance_companies'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    mobile = Column(String(15), nullable=True)
    license_number = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    is_active = Column(Boolean, default=True)
    fcm_token = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "license_number": self.license_number,
            "address": self.address,
            "city": self.city,
            "latitude": float(self.latitude) if self.latitude else None,
            "longitude": float(self.longitude) if self.longitude else None,
            "is_active": self.is_active,
            "fcm_token": self.fcm_token
        }

class InsuranceCustomer(Base):
    __tablename__ = 'insurance_customers'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    insurance_id = Column(String(36), ForeignKey('insurance_companies.id'), nullable=False)
    policy_number = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class EmergencyContact(Base):
    __tablename__ = 'emergency_contacts'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    contact_name = Column(String(100), nullable=False)
    mobile = Column(String(15), nullable=False)
    relation = Column(String(50), nullable=True)
    priority = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "contact_name": self.contact_name,
            "mobile": self.mobile,
            "relation": self.relation,
            "priority": self.priority
        }

def to_float_or_none(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_iso_or_none(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


class Accident(Base):
    __tablename__ = 'accidents'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    accident_code = Column(String(20), unique=True, nullable=False)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=True)
    device_id = Column(String(36), ForeignKey('devices.id'), nullable=True)
    vehicle_number = Column(String(20), nullable=True)
    vehicle_type = Column(String(20), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=False)
    longitude = Column(Numeric(11, 8), nullable=False)
    status = Column(String(50), default='active')
    severity = Column(String(50), default='medium')
    description = Column(Text, nullable=True)
    speed_at_impact = Column(Float, default=0.0)
    location_address = Column(Text, nullable=True)
    responder_id = Column(String(36), nullable=True)
    responder_type = Column(String(50), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "accident_code": self.accident_code,
            "user_id": self.user_id,
            "device_id": self.device_id,
            "vehicle_number": self.vehicle_number,
            "vehicle_type": self.vehicle_type,
            "latitude": to_float_or_none(self.latitude),
            "longitude": to_float_or_none(self.longitude),
            "status": self.status,
            "severity": self.severity,
            "phase": getattr(self, "phase", 1) or 1,
            "description": self.description,
            "speed_at_impact": self.speed_at_impact,
            "location_address": self.location_address,
            "responder_id": self.responder_id,
            "responder_type": self.responder_type,
            "resolved_at": to_iso_or_none(self.resolved_at),
            "createdAt": to_iso_or_none(self.created_at),
            "updatedAt": to_iso_or_none(self.updated_at)
        }

class Alert(Base):
    __tablename__ = 'alerts'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    accident_id = Column(String(36), ForeignKey('accidents.id'), nullable=False)
    recipient_id = Column(String(36), nullable=False)
    recipient_type = Column(String(50), nullable=False)
    message = Column(Text, nullable=True)
    status = Column(String(50), default='sent')
    sent_at = Column(DateTime, default=datetime.datetime.utcnow)
    read_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    phase = Column(Integer, default=1)
    distance_km = Column(Numeric(6, 2), nullable=True)
    eta_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "accident_id": self.accident_id,
            "recipient_id": self.recipient_id,
            "recipient_type": self.recipient_type,
            "message": self.message,
            "status": self.status,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "responded_at": self.responded_at.isoformat() if self.responded_at else None,
            "phase": self.phase,
            "distance_km": float(self.distance_km) if self.distance_km else None,
            "eta_minutes": self.eta_minutes,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }

class Notification(Base):
    __tablename__ = 'notifications'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=True)
    entity_id = Column(String(36), nullable=True)
    entity_type = Column(String(50), nullable=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default='info')
    is_read = Column(Boolean, default=False)
    data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "entity_id": self.entity_id,
            "entity_type": self.entity_type,
            "title": self.title,
            "message": self.message,
            "type": self.type,
            "is_read": self.is_read,
            "data": self.data,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }

class LiveLocation(Base):
    __tablename__ = 'live_locations'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_id = Column(String(36), nullable=False)
    entity_type = Column(String(50), nullable=False)
    latitude = Column(Numeric(10, 8), nullable=False)
    longitude = Column(Numeric(11, 8), nullable=False)
    speed = Column(Numeric(5, 2), default=0.0)
    heading = Column(Numeric(5, 2), default=0.0)
    accuracy = Column(Numeric(5, 2), default=0.0)
    recorded_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "entity_id": self.entity_id,
            "entity_type": self.entity_type,
            "latitude": float(self.latitude),
            "longitude": float(self.longitude),
            "speed": float(self.speed) if self.speed else 0.0,
            "heading": float(self.heading) if self.heading else 0.0,
            "accuracy": float(self.accuracy) if self.accuracy else 0.0,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None
        }

class Route(Base):
    __tablename__ = 'routes'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    accident_id = Column(String(36), nullable=True)
    from_entity_id = Column(String(36), nullable=False)
    from_entity_type = Column(String(50), nullable=False)
    to_lat = Column(Numeric(10, 8), nullable=False)
    to_lng = Column(Numeric(11, 8), nullable=False)
    distance_km = Column(Numeric(6, 2), nullable=True)
    eta_minutes = Column(Integer, nullable=True)
    route_points = Column(JSON, nullable=True)
    status = Column(String(50), default='active')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Acknowledgement(Base):
    __tablename__ = 'acknowledgements'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    accident_id = Column(String(36), ForeignKey('accidents.id'), nullable=False)
    alert_id = Column(String(36), nullable=True)
    responder_id = Column(String(36), nullable=False)
    responder_type = Column(String(50), nullable=False)
    action = Column(String(50), nullable=False)
    eta_minutes = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    acknowledged_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "accident_id": self.accident_id,
            "alert_id": self.alert_id,
            "responder_id": self.responder_id,
            "responder_type": self.responder_type,
            "action": self.action,
            "eta_minutes": self.eta_minutes,
            "notes": self.notes,
            "createdAt": self.created_at.isoformat()
        }

# Create tables
Base.metadata.create_all(bind=engine)

# ─── Auth/Crypt Utilities ─────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def admin_login_response(email, password):
    admin_email = os.getenv("ADMIN_EMAIL", "admin@aapadbandhav.in")
    admin_password = os.getenv("ADMIN_PASSWORD", "Admin@2024")

    if email != admin_email or password != admin_password:
        return None

    token = generate_token({"id": "admin-001", "role": "admin"})
    return {
        "success": True,
        "token": token,
        "user": {
            "id": "admin-001",
            "email": admin_email,
            "role": "admin",
            "full_name": "System Administrator"
        },
        "entityType": "admin"
    }

def generate_token(payload: dict) -> str:
    payload_copy = payload.copy()
    payload_copy['exp'] = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    return jwt.encode(payload_copy, app.config['SECRET_KEY'], algorithm='HS256')

def verify_token(token: str) -> dict:
    return jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])

# Decorators
def authenticate_jwt(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"success": False, "message": "No token provided"}), 401
        
        token = auth_header.split(" ")[1]
        try:
            decoded = verify_token(token)
        except jwt.ExpiredSignatureError:
            return jsonify({"success": False, "message": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"success": False, "message": "Invalid token"}), 401
        
        g.entity_id = decoded.get("id")
        g.entity_role = decoded.get("role")
        
        db = get_db()
        entity = None
        role = g.entity_role
        
        if role == 'user':
            entity = db.query(User).filter(User.id == g.entity_id).first()
            if entity: g.user = entity
        elif role == 'admin':
            if g.entity_id == 'admin-001':
                entity = type('Admin', (), {'id': 'admin-001', 'role': 'admin', 'is_active': True, 'full_name': 'System Administrator'})()
                g.user = entity
            else:
                entity = db.query(User).filter(User.id == g.entity_id, User.role == 'admin').first()
                if entity: g.user = entity
        elif role == 'hospital':
            entity = db.query(Hospital).filter(Hospital.id == g.entity_id).first()
            if entity: g.hospital = entity
        elif role == 'ambulance':
            entity = db.query(AmbulanceDriver).filter(AmbulanceDriver.id == g.entity_id).first()
            if entity: g.ambulance = entity
        elif role == 'police_station':
            entity = db.query(PoliceStation).filter(PoliceStation.id == g.entity_id).first()
            if entity: g.police_station = entity
        elif role == 'policeman':
            entity = db.query(Policeman).filter(Policeman.id == g.entity_id).first()
            if entity: g.policeman = entity
        elif role == 'mechanic':
            entity = db.query(Mechanic).filter(Mechanic.id == g.entity_id).first()
            if entity: g.mechanic = entity
        elif role == 'insurance':
            entity = db.query(InsuranceCompany).filter(InsuranceCompany.id == g.entity_id).first()
            if entity: g.insurance = entity
            
        if not entity:
            return jsonify({"success": False, "message": "Authentication failed - entity not found"}), 401
            
        if hasattr(entity, 'is_active') and not entity.is_active:
            return jsonify({"success": False, "message": "Account is deactivated"}), 403
            
        return f(*args, **kwargs)
    return decorated

def require_user_role(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(g, 'user'):
            return jsonify({"success": False, "message": "User access required"}), 403
        return f(*args, **kwargs)
    return decorated

def require_admin_role(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(g, 'user') or getattr(g.user, 'role', None) != 'admin':
            return jsonify({"success": False, "message": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated

# ─── Geolocation & Calculations ───────────────────────────────────────────────

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth's radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def estimate_eta(distance_km, avg_speed_kmh=40):
    return int(round((distance_km / avg_speed_kmh) * 60))

def find_nearby_entities(acc_lat, acc_lon, entities, radius_km):
    nearby = []
    for entity in entities:
        lat = float(entity.latitude) if entity.latitude else None
        lon = float(entity.longitude) if entity.longitude else None
        if lat is None or lon is None:
            continue
        dist = haversine_distance(acc_lat, acc_lon, lat, lon)
        if dist <= radius_km:
            entity_dict = entity.to_safe_json() if hasattr(entity, 'to_safe_json') else entity.to_json()
            entity_dict['distance_km'] = round(dist, 2)
            nearby.append(entity_dict)
    nearby.sort(key=lambda x: x['distance_km'])
    return nearby

def generate_route_points(from_lat, from_lon, to_lat, to_lon, steps=10):
    import random
    points = []
    for i in range(steps + 1):
        t = i / steps
        lat = from_lat + (to_lat - from_lat) * t + (random.random() - 0.5) * 0.001
        lng = from_lon + (to_lon - from_lon) * t + (random.random() - 0.5) * 0.001
        points.append({"lat": lat, "lng": lng})
    return points

# ─── Notification & SMS Services ──────────────────────────────────────────────

def send_push_notification(token, title, body, data=None):
    if not token:
        return
    # Firebase Cloud Messaging Python integration
    try:
        from firebase_admin import messaging
        # Only attempt if initialized
        import firebase_admin
        if firebase_admin._apps:
            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
                token=token
            )
            messaging.send(message)
            print(f"🔥 [FCM Push Sent] To token: {token[:15]}...")
    except Exception as e:
        print(f"❌ [FCM Push Failed] To token: {token[:15]}... Error: {e}")

def send_sms(mobile, message_body):
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")
    
    if account_sid and auth_token and from_number:
        try:
            from twilio.rest import Client
            client = Client(account_sid, auth_token)
            client.messages.create(body=message_body, from_=from_number, to=mobile)
            print(f"📱 [Twilio SMS Sent] To: {mobile}")
        except Exception as e:
            print(f"❌ [Twilio SMS Failed] To: {mobile} - Error: {e}")
    else:
        print(f"📱 [SMS LOG - Twilio Unconfigured] To: {mobile}\n   Message: {message_body}")

# ─── Dispatch Pipeline ────────────────────────────────────────────────────────

def run_phase_dispatch(accident_id, radius_km, phase):
    db = SessionLocal()
    try:
        accident = db.query(Accident).filter(Accident.id == accident_id).first()
        if not accident or accident.status not in ['active', 'dispatched']:
            return
            
        print(f"⚡ Running Phase {phase} dispatch for accident {accident.accident_code} (Radius: {radius_km}km)")
        lat = float(accident.latitude)
        lng = float(accident.longitude)
        
        user = db.query(User).filter(User.id == accident.user_id).first()
        if not user:
            return
            
        # 1. Notify emergency contacts
        contacts = db.query(EmergencyContact).filter(EmergencyContact.user_id == user.id).all()
        for contact in contacts:
            alert = Alert(
                accident_id=accident.id,
                recipient_id=contact.id,
                recipient_type='emergency_contact',
                message=f"🚨 EMERGENCY: {user.full_name} has been in an accident! Vehicle: {accident.vehicle_number}. Location: {accident.latitude}, {accident.longitude}",
                phase=phase,
                status='sent'
            )
            db.add(alert)
            
            notif = Notification(
                user_id=None,
                entity_id=contact.id,
                entity_type='emergency_contact',
                title=f"Emergency Alert - {user.full_name}",
                message=f"{user.full_name} may have been in an accident. Please call them immediately.",
                type='accident',
                data={"accidentId": accident.id}
            )
            db.add(notif)
            send_sms(contact.mobile, f"AapadBandhav ALERT: {user.full_name} accident near {round(lat, 5)}, {round(lng, 5)}. Please call immediately.")
            
        # 2. Nearby hospitals
        hospitals = db.query(Hospital).filter(Hospital.is_active == True, Hospital.is_available == True).all()
        nearby_hospitals = find_nearby_entities(lat, lng, hospitals, radius_km)
        for hosp in nearby_hospitals[:3]:
            eta = estimate_eta(hosp['distance_km'], 50)
            msg = f"🚨 ACCIDENT ALERT | User: {user.full_name} | Vehicle: {accident.vehicle_number} | Blood: {user.blood_group} | Distance: {hosp['distance_km']}km | ETA: {eta}min | Severity: {accident.severity.upper()}"
            alert = Alert(
                accident_id=accident.id,
                recipient_id=hosp['id'],
                recipient_type='hospital',
                message=msg,
                phase=phase,
                distance_km=hosp['distance_km'],
                eta_minutes=eta,
                status='sent'
            )
            db.add(alert)
            db.flush()
            socketio.emit(f"entity:{hosp['id']}:alert", {
                "type": "accident_alert",
                "alert": alert.to_json(),
                "accident": accident.to_json(),
                "user": user.to_safe_json()
            }, to=f"entity:{hosp['id']}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{hosp['id']}")
            if hosp.get('fcm_token'):
                send_push_notification(hosp['fcm_token'], "🚨 ACCIDENT ALERT", msg, {"accidentId": accident.id})

        # 3. Nearby ambulances
        ambulances = db.query(AmbulanceDriver).filter(AmbulanceDriver.is_active == True, AmbulanceDriver.is_available == True).all()
        nearby_ambulances = find_nearby_entities(lat, lng, ambulances, radius_km)
        for amb in nearby_ambulances[:3]:
            eta = estimate_eta(amb['distance_km'], 60)
            msg = f"🚨 ACCIDENT ALERT | User: {user.full_name} | Vehicle: {accident.vehicle_number} | Blood: {user.blood_group} | Distance: {amb['distance_km']}km | ETA: {eta}min | Severity: {accident.severity.upper()}"
            alert = Alert(
                accident_id=accident.id,
                recipient_id=amb['id'],
                recipient_type='ambulance',
                message=msg,
                phase=phase,
                distance_km=amb['distance_km'],
                eta_minutes=eta,
                status='sent'
            )
            db.add(alert)
            db.flush()
            socketio.emit(f"entity:{amb['id']}:alert", {
                "type": "accident_alert",
                "alert": alert.to_json(),
                "accident": accident.to_json(),
                "user": user.to_safe_json()
            }, to=f"entity:{amb['id']}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{amb['id']}")
            if amb.get('fcm_token'):
                send_push_notification(amb['fcm_token'], "🚨 ACCIDENT ALERT", msg, {"accidentId": accident.id})

        # 4. Nearby police stations
        stations = db.query(PoliceStation).filter(PoliceStation.is_active == True, PoliceStation.is_available == True).all()
        nearby_stations = find_nearby_entities(lat, lng, stations, radius_km)
        for st in nearby_stations[:2]:
            eta = estimate_eta(st['distance_km'], 60)
            msg = f"🚨 ACCIDENT ALERT | User: {user.full_name} | Vehicle: {accident.vehicle_number} | Distance: {st['distance_km']}km | ETA: {eta}min"
            alert = Alert(
                accident_id=accident.id,
                recipient_id=st['id'],
                recipient_type='police_station',
                message=msg,
                phase=phase,
                distance_km=st['distance_km'],
                eta_minutes=eta,
                status='sent'
            )
            db.add(alert)
            db.flush()
            socketio.emit(f"entity:{st['id']}:alert", {
                "type": "accident_alert",
                "alert": alert.to_json(),
                "accident": accident.to_json(),
                "user": user.to_safe_json()
            }, to=f"entity:{st['id']}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{st['id']}")
            if st.get('fcm_token'):
                send_push_notification(st['fcm_token'], "🚨 ACCIDENT ALERT", msg, {"accidentId": accident.id})

        # 5. Nearby policemen
        policemen = db.query(Policeman).filter(Policeman.is_active == True, Policeman.is_available == True).all()
        nearby_policemen = find_nearby_entities(lat, lng, policemen, radius_km)
        for p in nearby_policemen[:3]:
            eta = estimate_eta(p['distance_km'], 50)
            msg = f"🚨 ACCIDENT ALERT | User: {user.full_name} | Vehicle: {accident.vehicle_number} | Distance: {p['distance_km']}km | ETA: {eta}min"
            alert = Alert(
                accident_id=accident.id,
                recipient_id=p['id'],
                recipient_type='policeman',
                message=msg,
                phase=phase,
                distance_km=p['distance_km'],
                eta_minutes=eta,
                status='sent'
            )
            db.add(alert)
            db.flush()
            socketio.emit(f"entity:{p['id']}:alert", {
                "type": "accident_alert",
                "alert": alert.to_json(),
                "accident": accident.to_json(),
                "user": user.to_safe_json()
            }, to=f"entity:{p['id']}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{p['id']}")
            if p.get('fcm_token'):
                send_push_notification(p['fcm_token'], "🚨 ACCIDENT ALERT", msg, {"accidentId": accident.id})

        # 6. Nearby mechanics
        mechanics = db.query(Mechanic).filter(Mechanic.is_active == True, Mechanic.is_available == True).all()
        nearby_mechanics = find_nearby_entities(lat, lng, mechanics, radius_km)
        for m in nearby_mechanics[:2]:
            eta = estimate_eta(m['distance_km'], 30)
            msg = f"🚨 VEHICLE BREAKDOWN | User: {user.full_name} | Distance: {m['distance_km']}km | ETA: {eta}min"
            alert = Alert(
                accident_id=accident.id,
                recipient_id=m['id'],
                recipient_type='mechanic',
                message=msg,
                phase=phase,
                distance_km=m['distance_km'],
                eta_minutes=eta,
                status='sent'
            )
            db.add(alert)
            db.flush()
            socketio.emit(f"entity:{m['id']}:alert", {
                "type": "accident_alert",
                "alert": alert.to_json(),
                "accident": accident.to_json(),
                "user": user.to_safe_json()
            }, to=f"entity:{m['id']}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{m['id']}")
            if m.get('fcm_token'):
                send_push_notification(m['fcm_token'], "🚨 VEHICLE BREAKDOWN / ACCIDENT", msg, {"accidentId": accident.id})

        # 7. Linked insurance company
        ins_link = db.query(InsuranceCustomer).filter(InsuranceCustomer.user_id == user.id, InsuranceCustomer.is_active == True).first()
        if ins_link:
            alert = Alert(
                accident_id=accident.id,
                recipient_id=ins_link.insurance_id,
                recipient_type='insurance',
                message=f"🚨 CLAIM ALERT: Your insured customer {user.full_name} (Vehicle: {accident.vehicle_number}) has been in an accident.",
                phase=phase,
                status='sent'
            )
            db.add(alert)
            db.flush()
            socketio.emit(f"entity:{ins_link.insurance_id}:alert", {
                "type": "accident_alert",
                "alert": alert.to_json(),
                "accident": accident.to_json(),
                "user": user.to_safe_json()
            }, to=f"entity:{ins_link.insurance_id}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{ins_link.insurance_id}")
            ins_co = db.query(InsuranceCompany).filter(InsuranceCompany.id == ins_link.insurance_id).first()
            if ins_co and ins_co.fcm_token:
                send_push_notification(ins_co.fcm_token, "🚨 CLAIM ALERT", f"Your insured customer {user.full_name} (Vehicle: {accident.vehicle_number}) has been in an accident.", {"accidentId": accident.id})

        accident.status = 'dispatched'
        db.commit()

        # Emit dispatch completion summary
        socketio.emit('accident:dispatched', {
            "accidentId": accident.id,
            "phase": phase,
            "radiusKm": radius_km,
            "alertsSent": len(nearby_hospitals[:3]) + len(nearby_ambulances[:3]) + len(nearby_stations[:2]) + len(nearby_policemen[:3]) + len(nearby_mechanics[:2]) + (1 if ins_link else 0),
            "nearbyHospitals": len(nearby_hospitals),
            "nearbyAmbulances": len(nearby_ambulances),
            "timestamp": datetime.datetime.utcnow().isoformat()
        })
    except Exception as e:
        db.rollback()
        print(f"Error in phase dispatch: {e}")
        try:
            failed = db.query(Accident).filter(Accident.id == accident_id).first()
            if failed and failed.status == 'active':
                failed.status = 'dispatch_failed'
                failed.updated_at = datetime.datetime.utcnow()
                db.commit()
        except Exception as mark_error:
            db.rollback()
            print(f"Error marking dispatch failure: {mark_error}")
    finally:
        db.close()

def dispatch_emergency_response_bg(accident_id):
    db = SessionLocal()
    accident = db.query(Accident).filter(Accident.id == accident_id).first()
    if not accident:
        db.close()
        return
        
    # Broadcast new accident
    socketio.emit('accident:new', {
        "accidentId": accident.id,
        "code": accident.accident_code,
        "lat": float(accident.latitude),
        "lng": float(accident.longitude),
        "severity": accident.severity,
        "userId": accident.user_id,
        "timestamp": datetime.datetime.utcnow().isoformat()
    })
    db.close()

    # Run Phase 1
    run_phase_dispatch(accident_id, 8, 1)

    # Schedule Phase 2 after 30 seconds
    import time
    def delayed_phase2():
        time.sleep(30)
        db = SessionLocal()
        try:
            fresh = db.query(Accident).filter(Accident.id == accident_id).first()
            if fresh and fresh.status == 'dispatched':
                print(f"⚡ Triggering Phase 2 dispatch for {fresh.accident_code}")
                # We update the status or run dispatch
                db.close()
                run_phase_dispatch(accident_id, 25, 2)
                socketio.emit('accident:phase2', {
                    "accidentId": accident_id,
                    "code": fresh.accident_code,
                    "message": "No response received. Expanding search radius to 25km."
                })
        except Exception as ex:
            print(f"delayed Phase 2 error: {ex}")
            db.close()
            
    Thread(target=delayed_phase2).start()

# ─── Flask REST Route Handlers ────────────────────────────────────────────────

# ─── Auth ───
@app.route('/api/auth/user/register', methods=['POST'])
def user_register():
    data = request.json or {}
    full_name = data.get("full_name")
    email = data.get("email")
    mobile = data.get("mobile")
    password = data.get("password")
    
    if not full_name or not email or not mobile or not password:
        return jsonify({"success": False, "message": "Required fields missing"}), 422
        
    db = get_db()
    if db.query(User).filter(or_(User.email == email, User.mobile == mobile)).first():
        return jsonify({"success": False, "message": "Email or mobile already registered"}), 409
        
    # Generate unique 10 digit user ID
    import random
    unique_id = ""
    while True:
        first = str(random.randint(1, 9))
        rest = "".join([str(random.randint(0, 9)) for _ in range(9)])
        unique_id = first + rest
        if not db.query(User).filter(User.unique_id == unique_id).first():
            break
            
    user = User(
        unique_id=unique_id,
        full_name=full_name,
        email=email,
        mobile=mobile,
        password=hash_password(password),
        vehicle_number=data.get("vehicle_number"),
        vehicle_type=data.get("vehicle_type", "Car"),
        address=data.get("address"),
        blood_group=data.get("blood_group", "Unknown"),
        age=data.get("age"),
        gender=data.get("gender", "Prefer not to say"),
        role="user",
        is_active=True
    )
    db.add(user)
    db.commit()
    
    token = generate_token({"id": user.id, "role": user.role})
    return jsonify({"success": True, "message": "Account created successfully", "token": token, "user": user.to_safe_json()}), 201

@app.route('/api/auth/user/login', methods=['POST'])
def user_login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    
    db = get_db()
    user = db.query(User).filter(User.email == email).first()
    if not user or not check_password(password, user.password):
        return jsonify({"success": False, "message": "Invalid email or password"}), 401
    
    # Handle legacy users with null is_active (default to True)
    if user.is_active is not None and not user.is_active:
        return jsonify({"success": False, "message": "Account has been deactivated"}), 403
    
    # Ensure role is set for legacy users
    role = user.role or 'user'
    token = generate_token({"id": user.id, "role": role})
    return jsonify({"success": True, "token": token, "user": user.to_safe_json()})

@app.route('/api/auth/login', methods=['POST'])
def unified_login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    requested_role = data.get("role", "user")

    admin_res = admin_login_response(email, password)
    if admin_res:
        return jsonify(admin_res)

    db = get_db()
    if requested_role == "user":
        user = db.query(User).filter(User.email == email).first()
        if not user or not check_password(password, user.password):
            return jsonify({"success": False, "message": "Invalid email or password"}), 401
        if user.is_active is not None and not user.is_active:
            return jsonify({"success": False, "message": "Account has been deactivated"}), 403
        role = user.role or 'user'
        token = generate_token({"id": user.id, "role": role})
        return jsonify({"success": True, "token": token, "user": user.to_safe_json(), "entityType": role})

    entity_configs = {
        "hospital": (Hospital, "hospital"),
        "ambulance": (AmbulanceDriver, "driver"),
        "police_station": (PoliceStation, "station"),
        "policeman": (Policeman, "policeman"),
        "mechanic": (Mechanic, "mechanic"),
        "insurance": (InsuranceCompany, "company"),
    }
    config = entity_configs.get(requested_role)
    if not config:
        return jsonify({"success": False, "message": "Invalid role selected"}), 422

    model_cls, response_key = config
    entity = db.query(model_cls).filter(model_cls.email == email).first()
    if not entity or not check_password(password, entity.password):
        return jsonify({"success": False, "message": "Invalid credentials"}), 401
    if hasattr(entity, 'is_active') and not entity.is_active:
        return jsonify({"success": False, "message": "Account deactivated"}), 403

    token = generate_token({"id": entity.id, "role": requested_role})
    return jsonify({
        "success": True,
        "token": token,
        response_key: entity.to_safe_json(),
        "entityType": requested_role
    })

@app.route('/api/auth/hospital/register', methods=['POST'])
def hospital_register():
    data = request.json or {}
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")
    lat = data.get("latitude")
    lng = data.get("longitude")
    
    if not name or not email or not password or lat is None or lng is None:
        return jsonify({"success": False, "message": "name, email, password, latitude, longitude are required"}), 422
        
    db = get_db()
    if db.query(Hospital).filter(Hospital.email == email).first():
        return jsonify({"success": False, "message": "Email already registered"}), 409
        
    hospital = Hospital(
        name=name,
        email=email,
        password=hash_password(password),
        mobile=data.get("mobile"),
        latitude=lat,
        longitude=lng,
        specializations=data.get("specializations", []),
        bed_capacity=data.get("bed_capacity", 0),
        available_beds=data.get("bed_capacity", 0),
        registration_number=data.get("registration_number"),
        city=data.get("city"),
        state=data.get("state")
    )
    db.add(hospital)
    db.commit()
    
    token = generate_token({"id": hospital.id, "role": "hospital"})
    return jsonify({"success": True, "token": token, "hospital": hospital.to_safe_json()}), 201

@app.route('/api/auth/hospital/login', methods=['POST'])
def hospital_login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    
    db = get_db()
    hospital = db.query(Hospital).filter(Hospital.email == email).first()
    if not hospital or not check_password(password, hospital.password):
        return jsonify({"success": False, "message": "Invalid credentials"}), 401
        
    if not hospital.is_active:
        return jsonify({"success": False, "message": "Account deactivated"}), 403
        
    token = generate_token({"id": hospital.id, "role": "hospital"})
    return jsonify({"success": True, "token": token, "hospital": hospital.to_safe_json()})

# Generic Entity Authentication Helper Route generator
def make_entity_auth_routes(model_cls, role, response_key):
    @app.route(f'/api/auth/{role}/register', methods=['POST'], endpoint=f'{role}_register')
    def register():
        data = request.json or {}
        name = data.get("name")
        email = data.get("email")
        password = data.get("password")
        
        if not name or not email or not password:
            return jsonify({"success": False, "message": "name, email, and password are required"}), 422
            
        db = get_db()
        if db.query(model_cls).filter(model_cls.email == email).first():
            return jsonify({"success": False, "message": "Email already registered"}), 409
            
        # Extract metadata
        fields = {k: v for k, v in data.items() if k not in ["password"]}
        fields["password"] = hash_password(password)
        
        entity = model_cls(**fields)
        db.add(entity)
        db.commit()
        
        token = generate_token({"id": entity.id, "role": role})
        return jsonify({"success": True, "token": token, response_key: entity.to_safe_json()}), 201

    @app.route(f'/api/auth/{role}/login', methods=['POST'], endpoint=f'{role}_login')
    def login():
        data = request.json or {}
        email = data.get("email")
        password = data.get("password")
        
        db = get_db()
        entity = db.query(model_cls).filter(model_cls.email == email).first()
        if not entity or not check_password(password, entity.password):
            return jsonify({"success": False, "message": "Invalid credentials"}), 401
            
        if hasattr(entity, 'is_active') and not entity.is_active:
            return jsonify({"success": False, "message": "Account deactivated"}), 403
            
        token = generate_token({"id": entity.id, "role": role})
        return jsonify({"success": True, "token": token, response_key: entity.to_safe_json()})

make_entity_auth_routes(AmbulanceDriver, 'ambulance', 'driver')
make_entity_auth_routes(PoliceStation, 'police-station', 'station')
make_entity_auth_routes(Policeman, 'policeman', 'policeman')
make_entity_auth_routes(Mechanic, 'mechanic', 'mechanic')
make_entity_auth_routes(InsuranceCompany, 'insurance', 'company')

@app.route('/api/auth/admin/login', methods=['POST'])
def admin_login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")

    response = admin_login_response(email, password)
    if not response:
        return jsonify({"success": False, "message": "Invalid admin credentials"}), 401

    response.pop("entityType", None)
    return jsonify(response)

@app.route('/api/auth/me', methods=['GET'])
@authenticate_jwt
def auth_me():
    # Helper to return info about current entity
    db = get_db()
    if g.entity_role == 'user':
        return jsonify({"success": True, "user": g.user.to_safe_json()})
    elif g.entity_role == 'admin':
        return jsonify({"success": True, "user": {"id": "admin-001", "email": "admin@aapadbandhav.in", "role": "admin", "full_name": "System Administrator"}})
    elif g.entity_role == 'hospital':
        return jsonify({"success": True, "hospital": g.hospital.to_safe_json()})
    elif g.entity_role == 'ambulance':
        return jsonify({"success": True, "driver": g.ambulance.to_safe_json()})
    elif g.entity_role == 'police_station':
        return jsonify({"success": True, "station": g.police_station.to_safe_json()})
    elif g.entity_role == 'policeman':
        return jsonify({"success": True, "policeman": g.policeman.to_safe_json()})
    elif g.entity_role == 'mechanic':
        return jsonify({"success": True, "mechanic": g.mechanic.to_safe_json()})
    elif g.entity_role == 'insurance':
        return jsonify({"success": True, "company": g.insurance.to_safe_json()})
    return jsonify({"success": False, "message": "Not found"}), 404

# ─── User Profile & Emergency Contacts ───
def current_profile_entity(db):
    role = g.entity_role
    if role == 'user':
        return g.user, 'user'
    if role == 'hospital':
        return db.query(Hospital).filter(Hospital.id == g.entity_id).first(), 'hospital'
    if role == 'ambulance':
        return db.query(AmbulanceDriver).filter(AmbulanceDriver.id == g.entity_id).first(), 'driver'
    if role == 'police_station':
        return db.query(PoliceStation).filter(PoliceStation.id == g.entity_id).first(), 'station'
    if role == 'policeman':
        return db.query(Policeman).filter(Policeman.id == g.entity_id).first(), 'policeman'
    if role == 'mechanic':
        return db.query(Mechanic).filter(Mechanic.id == g.entity_id).first(), 'mechanic'
    if role == 'insurance':
        return db.query(InsuranceCompany).filter(InsuranceCompany.id == g.entity_id).first(), 'company'
    if role == 'admin':
        return type('Admin', (), {'id': 'admin-001', 'email': os.getenv("ADMIN_EMAIL", "admin@aapadbandhav.in"), 'role': 'admin', 'full_name': 'System Administrator'})(), 'user'
    return None, None

def parse_profile_value(field, value):
    if field in ['latitude', 'longitude']:
        return float(value) if value not in [None, ''] else None
    if field in ['age', 'bed_capacity', 'available_beds']:
        return int(value) if value not in [None, ''] else None
    if field == 'specializations':
        if isinstance(value, list):
            return value
        return [item.strip() for item in str(value or '').split(',') if item.strip()]
    return value

@app.route('/api/profile', methods=['GET', 'PUT'])
@authenticate_jwt
def profile():
    db = get_db()
    entity, response_key = current_profile_entity(db)
    if not entity:
        return jsonify({"success": False, "message": "Profile not found"}), 404

    if request.method == 'GET':
        profile_data = entity.to_safe_json() if hasattr(entity, 'to_safe_json') else {
            "id": entity.id,
            "email": entity.email,
            "role": entity.role,
            "full_name": entity.full_name
        }
        return jsonify({"success": True, "entityType": g.entity_role, "profile": profile_data, response_key: profile_data})

    if g.entity_role == 'admin':
        return jsonify({"success": False, "message": "Admin profile cannot be edited here"}), 403

    editable_fields = {
        'user': ['full_name', 'mobile', 'address', 'age', 'blood_group', 'gender', 'vehicle_number', 'vehicle_type'],
        'hospital': ['name', 'mobile', 'latitude', 'longitude', 'specializations', 'bed_capacity', 'available_beds', 'registration_number', 'city', 'state'],
        'ambulance': ['name', 'mobile', 'license_number', 'vehicle_number'],
        'police_station': ['name', 'mobile', 'station_code', 'latitude', 'longitude', 'address', 'city', 'state'],
        'policeman': ['name', 'mobile', 'badge_number', 'station_id'],
        'mechanic': ['name', 'mobile', 'specialization'],
        'insurance': ['name', 'mobile', 'license_number', 'latitude', 'longitude', 'address', 'city'],
    }.get(g.entity_role, [])

    data = request.json or {}
    for field in editable_fields:
        if field in data:
            setattr(entity, field, parse_profile_value(field, data.get(field)))

    if hasattr(entity, 'updated_at'):
        entity.updated_at = datetime.datetime.utcnow()

    db.add(entity)
    db.commit()
    profile_data = entity.to_safe_json()
    return jsonify({"success": True, "entityType": g.entity_role, "profile": profile_data, response_key: profile_data})

@app.route('/api/users/profile', methods=['GET', 'PUT'])
@authenticate_jwt
@require_user_role
def user_profile():
    db = get_db()
    if request.method == 'GET':
        device = db.query(Device).filter(Device.owner_id == g.user.id, Device.is_linked == True).first()
        contacts = db.query(EmergencyContact).filter(EmergencyContact.user_id == g.user.id).order_by(EmergencyContact.priority).all()
        return jsonify({
            "success": True,
            "user": g.user.to_safe_json(),
            "device": device.to_json() if device else None,
            "emergency_contacts": [c.to_json() for c in contacts]
        })
    else:
        # Update profile
        data = request.json or {}
        g.user.full_name = data.get("full_name", g.user.full_name)
        g.user.address = data.get("address", g.user.address)
        g.user.age = data.get("age", g.user.age)
        g.user.vehicle_number = data.get("vehicle_number", g.user.vehicle_number)
        g.user.blood_group = data.get("blood_group", g.user.blood_group)
        g.user.vehicle_type = data.get("vehicle_type", g.user.vehicle_type)
        g.user.mobile = data.get("mobile", g.user.mobile)
        g.user.gender = data.get("gender", g.user.gender)
        g.user.updated_at = datetime.datetime.utcnow()
        db.add(g.user)
        db.commit()
        return jsonify({"success": True, "user": g.user.to_safe_json()})

@app.route('/api/users/emergency-contacts', methods=['GET', 'POST'])
@authenticate_jwt
@require_user_role
def emergency_contacts():
    db = get_db()
    if request.method == 'GET':
        contacts = db.query(EmergencyContact).filter(EmergencyContact.user_id == g.user.id).all()
        return jsonify({"success": True, "emergency_contacts": [c.to_json() for c in contacts]})
    else:
        # Add contact
        data = request.json or {}
        name = data.get("contact_name")
        mobile = data.get("mobile")
        if not name or not mobile:
            return jsonify({"success": False, "message": "Name and mobile are required"}), 422
            
        priority = data.get("priority", 1)
        
        contact = EmergencyContact(
            user_id=g.user.id,
            contact_name=name,
            mobile=mobile,
            relation=data.get("relation"),
            priority=priority
        )
        db.add(contact)
        db.commit()
        return jsonify({"success": True, "emergency_contact": contact.to_json()}), 201

@app.route('/api/users/emergency-contacts/<id>', methods=['PUT', 'DELETE'])
@authenticate_jwt
@require_user_role
def emergency_contact_detail(id):
    db = get_db()
    contact = db.query(EmergencyContact).filter(EmergencyContact.id == id, EmergencyContact.user_id == g.user.id).first()
    if not contact:
        return jsonify({"success": False, "message": "Contact not found"}), 404
        
    if request.method == 'PUT':
        data = request.json or {}
        contact.contact_name = data.get("contact_name", contact.contact_name)
        contact.mobile = data.get("mobile", contact.mobile)
        contact.relation = data.get("relation", contact.relation)
        contact.priority = data.get("priority", contact.priority)
        db.commit()
        return jsonify({"success": True, "emergency_contact": contact.to_json()})
    else:
        db.delete(contact)
        db.commit()
        return jsonify({"success": True, "message": "Contact deleted"})

# ─── Devices ───
@app.route('/api/devices/my-device', methods=['GET'])
@authenticate_jwt
@require_user_role
def my_device():
    db = get_db()
    device = db.query(Device).filter(Device.owner_id == g.user.id, Device.is_linked == True).first()
    return jsonify({"success": True, "device": device.to_json() if device else None})

@app.route('/api/devices/link', methods=['POST'])
@authenticate_jwt
@require_user_role
def link_device():
    data = request.json or {}
    device_id = data.get("device_id")
    qr_code = data.get("qr_code")
    
    db = get_db()
    query = db.query(Device)
    if device_id:
        query = query.filter(Device.device_id == device_id)
    elif qr_code:
        query = query.filter(Device.qr_code == qr_code)
    else:
        return jsonify({"success": False, "message": "Device ID or QR Code required"}), 422
        
    device = query.first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    if device.is_linked:
        return jsonify({"success": False, "message": "Device is already linked to another vehicle"}), 409
        
    device.owner_id = g.user.id
    device.is_linked = True
    device.linked_at = datetime.datetime.utcnow()
    device.status = "active"
    db.commit()
    return jsonify({"success": True, "message": "Device linked successfully", "device": device.to_json()})

@app.route('/api/devices/unlink', methods=['POST'])
@authenticate_jwt
@require_user_role
def unlink_device():
    db = get_db()
    device = db.query(Device).filter(Device.owner_id == g.user.id, Device.is_linked == True).first()
    if not device:
        return jsonify({"success": False, "message": "No device linked"}), 404
        
    device.owner_id = None
    device.is_linked = False
    device.linked_at = None
    device.status = "unlinked"
    db.commit()
    return jsonify({"success": True, "message": "Device unlinked successfully"})

# ─── FCM Token Registration ───
@app.route('/api/notifications/fcm-token', methods=['POST'])
@authenticate_jwt
def register_fcm_token():
    data = request.json or {}
    token = data.get("token")
    if not token:
        return jsonify({"success": False, "message": "Token is required"}), 422
        
    db = get_db()
    role = g.entity_role
    
    if role == 'user':
        g.user.fcm_token = token
    elif role == 'hospital':
        g.hospital.fcm_token = token
    elif role == 'ambulance':
        g.ambulance.fcm_token = token
    elif role == 'police_station':
        g.police_station.fcm_token = token
    elif role == 'policeman':
        g.policeman.fcm_token = token
    elif role == 'mechanic':
        g.mechanic.fcm_token = token
    elif role == 'insurance':
        g.insurance.fcm_token = token
        
    db.commit()
    return jsonify({"success": True, "message": "FCM Token registered successfully"})

# ─── Accidents ───
@app.route('/api/accidents/trigger', methods=['POST'])
@authenticate_jwt
@require_user_role
def trigger_accident():
    data = request.json or {}
    lat = data.get("latitude")
    lng = data.get("longitude")
    severity = data.get("severity", "medium")
    description = data.get("description", "")
    speed = data.get("speed_at_impact", 0.0)
    
    if lat is None or lng is None:
        return jsonify({"success": False, "message": "Latitude and longitude required"}), 422
        
    db = get_db()
    # A fresh SOS from the same user replaces any older unresolved emergency.
    # This keeps responder dashboards focused on the latest incident.
    active_accidents = db.query(Accident).filter(
        Accident.user_id == g.user.id,
        Accident.status.in_(['active', 'dispatched', 'responded'])
    ).all()
    for old in active_accidents:
        old.status = 'superseded'
        old.resolved_at = datetime.datetime.utcnow()
        old.updated_at = datetime.datetime.utcnow()
        db.add(old)
        old_alerts = db.query(Alert).filter(
            Alert.accident_id == old.id,
            Alert.status.in_(['sent', 'delivered'])
        ).all()
        for old_alert in old_alerts:
            old_alert.status = 'superseded'
            old_alert.updated_at = datetime.datetime.utcnow()
            db.add(old_alert)
            socketio.emit('alert:removed', {
                "alertId": old_alert.id,
                "accidentId": old.id,
                "reason": "new_emergency"
            }, to=f"entity:{old_alert.recipient_id}")
        socketio.emit('accident:superseded', {
            "accidentId": old.id,
            "code": old.accident_code,
            "reason": "new_emergency"
        })
    if active_accidents:
        db.commit()
        
    # Generate unique accident code
    import random
    code = ""
    while True:
        code = f"ACC-{random.randint(100000, 999999)}"
        if not db.query(Accident).filter(Accident.accident_code == code).first():
            break
            
    device = db.query(Device).filter(Device.owner_id == g.user.id, Device.is_linked == True).first()
    
    accident = Accident(
        accident_code=code,
        user_id=g.user.id,
        device_id=device.id if device else None,
        vehicle_number=g.user.vehicle_number,
        vehicle_type=g.user.vehicle_type,
        latitude=lat,
        longitude=lng,
        severity=severity,
        description=description,
        speed_at_impact=float(speed) if speed else 0.0,
        location_address=f"{round(float(lat), 5)}°N, {round(float(lng), 5)}°E",
        status="active"
    )
    db.add(accident)
    db.commit()
    
    # Run async background dispatch pipeline
    dispatch_emergency_response_bg(accident.id)
    
    return jsonify({
        "success": True,
        "message": "Emergency triggered. Help is on the way.",
        "accident": {
            "id": accident.id,
            "code": accident.accident_code,
            "status": accident.status,
            "severity": accident.severity,
            "latitude": float(accident.latitude),
            "longitude": float(accident.longitude),
            "createdAt": accident.created_at.isoformat()
        }
    }), 201

@app.route('/api/accidents/my', methods=['GET'])
@authenticate_jwt
@require_user_role
def my_accidents():
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 20))
    offset = (page - 1) * limit
    
    db = get_db()
    query = db.query(Accident).filter(Accident.user_id == g.user.id).order_by(desc(Accident.created_at))
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    
    return jsonify({
        "success": True,
        "accidents": [a.to_json() for a in rows],
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": math.ceil(total / limit)
        }
    })

@app.route('/api/accidents/<id>', methods=['GET'])
@authenticate_jwt
def accident_detail(id):
    db = get_db()
    accident = db.query(Accident).filter(Accident.id == id).first()
    if not accident:
        return jsonify({"success": False, "message": "Accident not found"}), 404
        
    # Access control
    if g.entity_role == 'user' and accident.user_id != g.user.id:
        return jsonify({"success": False, "message": "Access denied"}), 403
        
    alerts = db.query(Alert).filter(Alert.accident_id == accident.id).order_by(desc(Alert.created_at)).all()
    acks = db.query(Acknowledgement).filter(Acknowledgement.accident_id == accident.id).order_by(desc(Acknowledgement.created_at)).all()
    user = db.query(User).filter(User.id == accident.user_id).first()
    
    return jsonify({
        "success": True,
        "accident": accident.to_json(),
        "alerts": [al.to_json() for al in alerts],
        "acknowledgements": [ac.to_json() for ac in acks],
        "user": user.to_safe_json() if user else None
    })

def make_close_accident_handler(status_val):
    def handler(id):
        db = get_db()
        accident = db.query(Accident).filter(Accident.id == id, Accident.user_id == g.user.id).first()
        if not accident:
            return jsonify({"success": False, "message": "Accident not found"}), 404
            
        if accident.status in ['resolved', 'cancelled', 'false_alarm']:
            return jsonify({"success": False, "message": f"Accident is already {accident.status}"}), 409
            
        accident.status = status_val
        accident.resolved_at = datetime.datetime.utcnow()
        db.commit()
        
        socketio.emit(f"accident:{status_val}", {"accidentId": accident.id, "code": accident.accident_code})
        return jsonify({"success": True, "message": f"Accident marked as {status_val}", "accident": {"id": accident.id, "status": status_val}})
    return handler

@app.route('/api/accidents/<id>/cancel', methods=['POST'])
@authenticate_jwt
@require_user_role
def cancel_accident(id):
    return make_close_accident_handler('cancelled')(id)

@app.route('/api/accidents/<id>/false-alarm', methods=['POST'])
@authenticate_jwt
@require_user_role
def false_alarm_accident(id):
    return make_close_accident_handler('false_alarm')(id)

@app.route('/api/accidents/<id>/resolve', methods=['POST'])
@authenticate_jwt
def resolve_accident(id):
    db = get_db()
    accident = db.query(Accident).filter(Accident.id == id).first()
    if not accident:
        return jsonify({"success": False, "message": "Not found"}), 404
        
    accident.status = 'resolved'
    accident.resolved_at = datetime.datetime.utcnow()
    db.commit()
    
    socketio.emit('accident:resolved', {"accidentId": accident.id, "code": accident.accident_code})
    return jsonify({"success": True, "message": "Accident resolved", "accident": {"id": accident.id, "status": "resolved"}})

@app.route('/api/accidents', methods=['GET'])
@authenticate_jwt
def list_accidents():
    status = request.args.get("status")
    severity = request.args.get("severity")
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))
    offset = (page - 1) * limit
    
    db = get_db()
    query = db.query(Accident)
    if status:
        query = query.filter(Accident.status == status)
    if severity:
        query = query.filter(Accident.severity == severity)
        
    query = query.order_by(desc(Accident.created_at))
    total = query.count()
    rows = query.offset(offset).limit(limit).all()
    
    return jsonify({
        "success": True,
        "accidents": [a.to_json() for a in rows],
        "pagination": {
            "total": total,
            "page": page,
            "pages": math.ceil(total / limit)
        }
    })

# ─── Locations ───
@app.route('/api/locations/update', methods=['POST'])
@authenticate_jwt
def update_location_rest():
    data = request.json or {}
    lat = data.get("latitude")
    lng = data.get("longitude")
    speed = data.get("speed", 0.0)
    heading = data.get("heading", 0.0)
    accuracy = data.get("accuracy", 0.0)
    
    if lat is None or lng is None:
        return jsonify({"success": False, "message": "Coordinates required"}), 400
        
    db = get_db()
    entity_type = 'user' if g.entity_role in ['user', 'admin'] else g.entity_role
    
    live_loc = LiveLocation(
        entity_id=g.entity_id,
        entity_type=entity_type,
        latitude=lat,
        longitude=lng,
        speed=speed,
        heading=heading,
        accuracy=accuracy
    )
    db.add(live_loc)
    
    if g.entity_role == 'user':
        db.query(User).filter(User.id == g.entity_id).update({
            "last_location_lat": lat,
            "last_location_lng": lng,
            "last_seen": datetime.datetime.utcnow()
        })
    elif g.entity_role == 'ambulance':
        db.query(AmbulanceDriver).filter(AmbulanceDriver.id == g.entity_id).update({
            "latitude": lat,
            "longitude": lng,
            "last_seen": datetime.datetime.utcnow()
        })
    elif g.entity_role == 'policeman':
        db.query(Policeman).filter(Policeman.id == g.entity_id).update({
            "latitude": lat,
            "longitude": lng,
            "last_seen": datetime.datetime.utcnow()
        })
    elif g.entity_role == 'mechanic':
        db.query(Mechanic).filter(Mechanic.id == g.entity_id).update({
            "latitude": lat,
            "longitude": lng,
            "last_seen": datetime.datetime.utcnow()
        })
        
    db.commit()
    
    socketio.emit('entity:location', {
        "entityId": g.entity_id,
        "entityType": g.entity_role,
        "latitude": float(lat),
        "longitude": float(lng),
        "speed": speed,
        "timestamp": datetime.datetime.utcnow().isoformat()
    })
    return jsonify({"success": True})

@app.route('/api/locations/<entity_type>/<entity_id>', methods=['GET'])
@authenticate_jwt
def location_history(entity_type, entity_id):
    limit = int(request.args.get("limit", 100))
    db = get_db()
    locs = db.query(LiveLocation).filter(
        LiveLocation.entity_id == entity_id,
        LiveLocation.entity_type == entity_type
    ).order_by(desc(LiveLocation.recorded_at)).limit(limit).all()
    
    return jsonify({"success": True, "locations": [l.to_json() for l in locs]})

@app.route('/api/locations/active-responders', methods=['GET'])
@authenticate_jwt
def active_responders():
    db = get_db()
    hospitals = db.query(Hospital).filter(Hospital.is_active == True).all()
    ambulances = db.query(AmbulanceDriver).filter(AmbulanceDriver.is_active == True).all()
    police_stations = db.query(PoliceStation).filter(PoliceStation.is_active == True).all()
    police = db.query(Policeman).filter(Policeman.is_active == True).all()
    mechanics = db.query(Mechanic).filter(Mechanic.is_active == True).all()
    insurance_companies = db.query(InsuranceCompany).filter(InsuranceCompany.is_active == True).all()
    
    return jsonify({
        "success": True,
        "responders": {
            "hospitals": [{**h.to_safe_json(), "type": "hospital"} for h in hospitals],
            "ambulances": [{**a.to_safe_json(), "type": "ambulance"} for a in ambulances],
            "policeStations": [{**p.to_safe_json(), "type": "police_station"} for p in police_stations],
            "police": [{**p.to_safe_json(), "type": "policeman"} for p in police],
            "mechanics": [{**m.to_safe_json(), "type": "mechanic"} for m in mechanics],
            "insurance": [{**i.to_safe_json(), "type": "insurance"} for i in insurance_companies]
        }
    })

# ─── Alerts & Responder operations ───
@app.route('/api/alerts/my-alerts', methods=['GET'])
@app.route('/api/hospitals/alerts', methods=['GET'])
@app.route('/api/ambulances/alerts', methods=['GET'])
@app.route('/api/police/station/alerts', methods=['GET'])
@app.route('/api/mechanics/alerts', methods=['GET'])
@authenticate_jwt
def my_alerts():
    db = get_db()
    # Recipient can be hospital, ambulance, police_station, policeman, mechanic, insurance
    alerts = db.query(Alert).filter(
        Alert.recipient_id == g.entity_id,
        Alert.recipient_type == g.entity_role
    ).order_by(desc(Alert.created_at)).all()
    
    # Join with accident details
    res_list = []
    for alert in alerts:
        accident = db.query(Accident).filter(Accident.id == alert.accident_id).first()
        user = db.query(User).filter(User.id == accident.user_id).first() if accident else None
        res_list.append({
            "id": alert.id,
            "accident_id": alert.accident_id,
            "recipient_id": alert.recipient_id,
            "recipient_type": alert.recipient_type,
            "message": alert.message,
            "status": alert.status,
            "phase": alert.phase,
            "distance_km": float(alert.distance_km) if alert.distance_km else None,
            "eta_minutes": alert.eta_minutes,
            "createdAt": alert.created_at.isoformat(),
            "accident": accident.to_json() if accident else None,
            "user": user.to_safe_json() if user else None
        })
    return jsonify({"success": True, "alerts": res_list})

@app.route('/api/alerts/<id>', methods=['GET'])
@authenticate_jwt
def alert_details(id):
    db = get_db()
    alert = db.query(Alert).filter(Alert.id == id).first()
    if not alert:
        return jsonify({"success": False, "message": "Alert not found"}), 404
    accident = db.query(Accident).filter(Accident.id == alert.accident_id).first()
    return jsonify({"success": True, "alert": alert.to_json(), "accident": accident.to_json() if accident else None})

@app.route('/api/alerts/accident/<accident_id>', methods=['GET'])
@authenticate_jwt
def accident_alerts(accident_id):
    db = get_db()
    alerts = db.query(Alert).filter(Alert.accident_id == accident_id).order_by(desc(Alert.created_at)).all()
    return jsonify({"success": True, "alerts": [a.to_json() for a in alerts]})

@app.route('/api/alerts/<id>/respond', methods=['POST'])
@app.route('/api/hospitals/alerts/<id>/respond', methods=['POST'])
@app.route('/api/ambulances/alerts/<id>/respond', methods=['POST'])
@app.route('/api/police/station/alerts/<id>/respond', methods=['POST'])
@app.route('/api/mechanics/alerts/<id>/respond', methods=['POST'])
@authenticate_jwt
def respond_alert(id):
    data = request.json or {}
    action = data.get("action")
    eta = data.get("eta")
    
    db = get_db()
    alert = db.query(Alert).filter(Alert.id == id).first()
    if not alert:
        return jsonify({"success": False, "message": "Alert not found"}), 404
        
    alert.status = 'accepted' if action == 'accepted' else 'rejected'
    alert.responded_at = datetime.datetime.utcnow()
    
    ack = Acknowledgement(
        accident_id=alert.accident_id,
        alert_id=alert.id,
        responder_id=g.entity_id,
        responder_type=g.entity_role,
        action=action,
        eta_minutes=eta
    )
    db.add(ack)
    
    if action == 'accepted':
        db.query(Accident).filter(Accident.id == alert.accident_id).update({
            "status": "responded",
            "responder_id": g.entity_id,
            "responder_type": g.entity_role
        })
        
        payload = {
            "accidentId": alert.accident_id,
            "responderType": g.entity_role,
            "eta": eta
        }
        socketio.emit(f"accident:{alert.accident_id}:responded", payload)
        socketio.emit("accident:responded", payload)
        
    db.commit()
    return jsonify({"success": True, "acknowledgement": ack.to_json()})

@app.route('/api/locations/status', methods=['PUT'])
@authenticate_jwt
def update_status():
    data = request.json or {}
    is_available = data.get("is_available")
    is_active = data.get("is_active")
    
    db = get_db()
    role = g.entity_role
    
    # We update dynamic keys based on role
    entity = None
    if role == 'hospital':
        entity = db.query(Hospital).filter(Hospital.id == g.entity_id).first()
    elif role == 'ambulance':
        entity = db.query(AmbulanceDriver).filter(AmbulanceDriver.id == g.entity_id).first()
    elif role == 'police_station':
        entity = db.query(PoliceStation).filter(PoliceStation.id == g.entity_id).first()
    elif role == 'policeman':
        entity = db.query(Policeman).filter(Policeman.id == g.entity_id).first()
    elif role == 'mechanic':
        entity = db.query(Mechanic).filter(Mechanic.id == g.entity_id).first()
        
    if not entity:
        return jsonify({"success": False, "message": "Entity not found"}), 404
        
    if is_available is not None:
        entity.is_available = str(is_available).lower() == "true" if isinstance(is_available, str) else bool(is_available)
    if is_active is not None:
        entity.is_active = str(is_active).lower() == "true" if isinstance(is_active, str) else bool(is_active)
        
    db.add(entity)
    db.commit()
    return jsonify({"success": True})

@app.route('/api/hospitals/availability', methods=['PUT'])
@authenticate_jwt
def update_hospital_availability():
    if g.entity_role != 'hospital':
        return jsonify({"success": False, "message": "Hospital access required"}), 403

    data = request.json or {}
    if "is_available" not in data:
        return jsonify({"success": False, "message": "Availability payload missing"}), 422

    db = get_db()
    hospital = db.query(Hospital).filter(Hospital.id == g.entity_id).first()
    if not hospital:
        return jsonify({"success": False, "message": "Hospital not found"}), 404

    is_available = data.get("is_available")
    hospital.is_available = str(is_available).lower() == "true" if isinstance(is_available, str) else bool(is_available)
    db.add(hospital)
    db.commit()
    return jsonify({"success": True, "hospital": hospital.to_safe_json()})

@app.route('/api/hospitals/beds', methods=['PUT'])
@authenticate_jwt
def update_hospital_beds():
    data = request.json or {}
    bed_capacity = data.get("bed_capacity")
    available_beds = data.get("available_beds")
    
    if bed_capacity is None and available_beds is None:
        return jsonify({"success": False, "message": "Beds payload missing"}), 422
        
    db = get_db()
    if g.entity_role != 'hospital':
        return jsonify({"success": False, "message": "Hospital access required"}), 403
        
    hospital = db.query(Hospital).filter(Hospital.id == g.entity_id).first()
    if not hospital:
        return jsonify({"success": False, "message": "Hospital not found"}), 404
        
    if bed_capacity is not None:
        hospital.bed_capacity = bed_capacity
    if available_beds is not None:
        hospital.available_beds = available_beds
        
    db.add(hospital)
    db.commit()
    return jsonify({"success": True, "hospital": hospital.to_safe_json()})

# ─── Admin Dashboards ───
def require_insurance_role():
    if g.entity_role != 'insurance':
        return jsonify({"success": False, "message": "Insurance access required"}), 403
    return None

def insurance_customer_json(link, user=None):
    return {
        "id": link.id,
        "user_id": link.user_id,
        "insurance_id": link.insurance_id,
        "policy_number": link.policy_number,
        "is_active": link.is_active,
        "linked_at": link.created_at.isoformat() if link.created_at else None,
        "user": user.to_safe_json() if user else None
    }

@app.route('/api/insurance/customers', methods=['GET'])
@authenticate_jwt
def insurance_customers():
    denied = require_insurance_role()
    if denied:
        return denied

    db = get_db()
    links = db.query(InsuranceCustomer).filter(
        InsuranceCustomer.insurance_id == g.entity_id,
        InsuranceCustomer.is_active == True
    ).order_by(desc(InsuranceCustomer.created_at)).all()

    customers = []
    for link in links:
        user = db.query(User).filter(User.id == link.user_id).first()
        customers.append(insurance_customer_json(link, user))
    return jsonify({"success": True, "customers": customers})

@app.route('/api/insurance/link-customer', methods=['POST'])
@authenticate_jwt
def insurance_link_customer():
    denied = require_insurance_role()
    if denied:
        return denied

    data = request.json or {}
    unique_id = (data.get("unique_id") or "").strip()
    policy_number = data.get("policy_number")
    if not unique_id:
        return jsonify({"success": False, "message": "User ID is required"}), 422

    db = get_db()
    user = db.query(User).filter(User.unique_id == unique_id, User.role == 'user').first()
    if not user:
        return jsonify({"success": False, "message": "User not found"}), 404

    existing = db.query(InsuranceCustomer).filter(
        InsuranceCustomer.user_id == user.id,
        InsuranceCustomer.insurance_id == g.entity_id
    ).first()
    if existing:
        existing.is_active = True
        existing.policy_number = policy_number or existing.policy_number
        db.add(existing)
        db.commit()
        return jsonify({"success": True, "customer": insurance_customer_json(existing, user), "user": user.to_safe_json()})

    link = InsuranceCustomer(
        user_id=user.id,
        insurance_id=g.entity_id,
        policy_number=policy_number,
        is_active=True
    )
    db.add(link)
    db.commit()
    return jsonify({"success": True, "customer": insurance_customer_json(link, user), "user": user.to_safe_json()}), 201

@app.route('/api/insurance/customers/<user_id>', methods=['DELETE'])
@authenticate_jwt
def insurance_unlink_customer(user_id):
    denied = require_insurance_role()
    if denied:
        return denied

    db = get_db()
    link = db.query(InsuranceCustomer).filter(
        InsuranceCustomer.user_id == user_id,
        InsuranceCustomer.insurance_id == g.entity_id,
        InsuranceCustomer.is_active == True
    ).first()
    if not link:
        return jsonify({"success": False, "message": "Customer link not found"}), 404

    link.is_active = False
    db.add(link)
    db.commit()
    return jsonify({"success": True})

@app.route('/api/insurance/alerts', methods=['GET'])
@authenticate_jwt
def insurance_alerts():
    denied = require_insurance_role()
    if denied:
        return denied

    db = get_db()
    alerts = db.query(Alert).filter(
        Alert.recipient_id == g.entity_id,
        Alert.recipient_type == 'insurance'
    ).order_by(desc(Alert.created_at)).all()

    result = []
    for alert in alerts:
        item = alert.to_json()
        accident = db.query(Accident).filter(Accident.id == alert.accident_id).first()
        victim = db.query(User).filter(User.id == accident.user_id).first() if accident else None
        item["accident"] = accident.to_json() if accident else None
        item["victim"] = victim.to_safe_json() if victim else None
        result.append(item)
    return jsonify({"success": True, "alerts": result})

def build_admin_dashboard(db):
    total_acc = db.query(Accident).count()
    resolved_acc = db.query(Accident).filter(Accident.status == 'resolved').count()
    active_acc = db.query(Accident).filter(Accident.status.in_(['active', 'dispatched', 'responded'])).count()
    cancelled_acc = db.query(Accident).filter(Accident.status == 'cancelled').count()

    total_dev = db.query(Device).count()
    linked_dev = db.query(Device).filter(Device.is_linked == True).count()

    total_users = db.query(User).filter(User.role == 'user').count()
    active_users = db.query(User).filter(User.role == 'user', User.is_active == True).count()

    hosp_count = db.query(Hospital).count()
    amb_count = db.query(AmbulanceDriver).count()
    pol_count = db.query(Policeman).count()
    mech_count = db.query(Mechanic).count()
    ins_count = db.query(InsuranceCompany).count()

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": total_users - active_users
        },
        "accidents": {
            "total": total_acc,
            "active": active_acc,
            "resolved": resolved_acc,
            "cancelled": cancelled_acc
        },
        "devices": {
            "total": total_dev,
            "linked": linked_dev,
            "unlinked": total_dev - linked_dev
        },
        "services": {
            "hospitals": hosp_count,
            "ambulances": amb_count,
            "police": pol_count,
            "mechanics": mech_count,
            "insurance": ins_count
        }
    }


def build_admin_analytics(db):
    accidents = db.query(Accident).all()
    by_status = {}
    by_severity = {}
    for accident in accidents:
        status = accident.status or "unknown"
        severity = accident.severity or "unknown"
        by_status[status] = by_status.get(status, 0) + 1
        by_severity[severity] = by_severity.get(severity, 0) + 1

    severity_order = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    return {
        "byStatus": [
            {"status": status, "count": count}
            for status, count in sorted(by_status.items())
        ],
        "bySeverity": [
            {"severity": severity, "count": count}
            for severity, count in sorted(by_severity.items(), key=lambda item: severity_order.get(item[0], 99))
        ]
    }


@app.route('/api/admin/dashboard', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_dashboard():
    db = get_db()
    return jsonify({"success": True, "dashboard": build_admin_dashboard(db)})


@app.route('/api/admin/analytics', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_analytics():
    db = get_db()
    return jsonify({"success": True, "analytics": build_admin_analytics(db)})


@app.route('/api/admin/stats', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_stats():
    db = get_db()
    total_acc = db.query(Accident).count()
    resolved_acc = db.query(Accident).filter(Accident.status == 'resolved').count()
    active_acc = db.query(Accident).filter(Accident.status.in_(['active', 'dispatched', 'responded'])).count()
    
    total_dev = db.query(Device).count()
    linked_dev = db.query(Device).filter(Device.is_linked == True).count()
    
    total_users = db.query(User).filter(User.role == 'user').count()
    
    hosp_count = db.query(Hospital).count()
    amb_count = db.query(AmbulanceDriver).count()
    pol_count = db.query(Policeman).count()
    mech_count = db.query(Mechanic).count()
    ins_count = db.query(InsuranceCompany).count()
    
    return jsonify({
        "success": True,
        "totalAccidents": total_acc,
        "resolvedAccidents": resolved_acc,
        "activeAccidents": active_acc,
        "deviceStats": {
            "total": total_dev,
            "linked": linked_dev,
            "unlinked": total_dev - linked_dev
        },
        "responderStats": {
            "hospitals": hosp_count,
            "ambulances": amb_count,
            "police": pol_count,
            "mechanics": mech_count,
            "insurance": ins_count
        },
        "totalUsers": total_users
    })

@app.route('/api/admin/recent-accidents', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_recent_accidents():
    db = get_db()
    rows = db.query(Accident).order_by(desc(Accident.created_at)).limit(10).all()
    return jsonify({"success": True, "accidents": [a.to_json() for a in rows]})

@app.route('/api/admin/accidents', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_list_accidents():
    status = request.args.get("status")
    limit = int(request.args.get("limit", 100))

    db = get_db()
    query = db.query(Accident)
    if status and status != "all":
        query = query.filter(Accident.status == status)

    rows = query.order_by(desc(Accident.created_at)).limit(limit).all()
    return jsonify({"success": True, "accidents": [a.to_json() for a in rows]})

@app.route('/api/users', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_list_users():
    role = request.args.get("role", "user")
    db = get_db()
    rows = db.query(User).filter(User.role == role).order_by(desc(User.created_at)).all()
    return jsonify({"success": True, "users": [u.to_safe_json() for u in rows]})

@app.route('/api/admin/users', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_search_users():
    search = (request.args.get("search") or "").strip().lower()
    limit = int(request.args.get("limit", 50))
    role_filter = request.args.get("role", "all")

    db = get_db()
    configs = [
        ("user", User, "full_name"),
        ("hospital", Hospital, "name"),
        ("ambulance", AmbulanceDriver, "name"),
        ("police_station", PoliceStation, "name"),
        ("policeman", Policeman, "name"),
        ("mechanic", Mechanic, "name"),
        ("insurance", InsuranceCompany, "name"),
    ]
    rows = []
    for role, model_cls, name_field in configs:
        if role_filter != "all" and role_filter != role:
            continue
        for entity in db.query(model_cls).all():
            data = entity.to_safe_json()
            rows.append({
                **data,
                "entityType": role,
                "display_name": data.get(name_field) or data.get("name") or data.get("full_name") or data.get("email"),
                "unique_id": data.get("unique_id") or data.get("station_code") or data.get("badge_number") or data.get("license_number") or data.get("id"),
            })
    if search:
        rows = [
            item for item in rows
            if search in (item.get("display_name") or "").lower()
            or search in (item.get("email") or "").lower()
            or search in (item.get("unique_id") or "").lower()
            or search in (item.get("mobile") or "").lower()
            or search in (item.get("entityType") or "").lower()
        ]
    rows.sort(key=lambda item: ((item.get("entityType") or ""), (item.get("display_name") or "")))
    rows = rows[:limit]

    return jsonify({"success": True, "users": rows})

@app.route('/api/admin/services/register', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_register_service():
    data = request.json or {}
    role = data.get("role")
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not role or not name or not email or not password:
        return jsonify({"success": False, "message": "role, name, email, and password are required"}), 422

    db = get_db()
    service_configs = {
        "hospital": (Hospital, "hospital", {
            "name": name,
            "email": email,
            "password": hash_password(password),
            "mobile": data.get("mobile"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "specializations": data.get("specializations", []),
            "bed_capacity": int(data.get("bed_capacity") or 0),
            "available_beds": int(data.get("available_beds") or data.get("bed_capacity") or 0),
            "registration_number": data.get("registration_number"),
            "city": data.get("city"),
            "state": data.get("state"),
            "is_active": True,
            "is_available": True
        }),
        "ambulance": (AmbulanceDriver, "driver", {
            "name": name,
            "email": email,
            "password": hash_password(password),
            "mobile": data.get("mobile"),
            "license_number": data.get("license_number"),
            "vehicle_number": data.get("vehicle_number"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "is_active": True,
            "is_available": True,
            "last_seen": datetime.datetime.utcnow()
        }),
        "police_station": (PoliceStation, "station", {
            "name": name,
            "email": email,
            "password": hash_password(password),
            "mobile": data.get("mobile"),
            "station_code": data.get("station_code"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "address": data.get("address"),
            "city": data.get("city"),
            "state": data.get("state"),
            "is_active": True,
            "is_available": True
        }),
        "policeman": (Policeman, "policeman", {
            "name": name,
            "email": email,
            "password": hash_password(password),
            "mobile": data.get("mobile"),
            "badge_number": data.get("badge_number"),
            "station_id": data.get("station_id"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "is_active": True,
            "is_available": True,
            "last_seen": datetime.datetime.utcnow()
        }),
        "mechanic": (Mechanic, "mechanic", {
            "name": name,
            "email": email,
            "password": hash_password(password),
            "mobile": data.get("mobile"),
            "specialization": data.get("specialization"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "is_active": True,
            "is_available": True,
            "rating": 4.0,
            "last_seen": datetime.datetime.utcnow()
        }),
        "insurance": (InsuranceCompany, "company", {
            "name": name,
            "email": email,
            "password": hash_password(password),
            "mobile": data.get("mobile"),
            "license_number": data.get("license_number"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "address": data.get("address"),
            "city": data.get("city"),
            "is_active": True
        }),
    }

    config = service_configs.get(role)
    if not config:
        return jsonify({"success": False, "message": "Invalid service role"}), 422

    model_cls, response_key, fields = config
    if role in ["hospital", "police_station", "insurance"] and (fields["latitude"] is None or fields["longitude"] is None):
        return jsonify({"success": False, "message": f"{role.replace('_', ' ').title()} latitude and longitude are required"}), 422

    if db.query(model_cls).filter(model_cls.email == email).first():
        return jsonify({"success": False, "message": "Email already registered"}), 409

    entity = model_cls(**fields)
    db.add(entity)
    db.commit()

    return jsonify({"success": True, response_key: entity.to_safe_json()}), 201

@app.route('/api/admin/users/<id>/toggle', methods=['PUT'])
@authenticate_jwt
@require_admin_role
def admin_toggle_user(id):
    db = get_db()
    role = request.args.get("role", "user")
    model_map = {
        "user": User,
        "hospital": Hospital,
        "ambulance": AmbulanceDriver,
        "police_station": PoliceStation,
        "policeman": Policeman,
        "mechanic": Mechanic,
        "insurance": InsuranceCompany,
    }
    model_cls = model_map.get(role)
    if not model_cls:
        return jsonify({"success": False, "message": "Invalid role"}), 422

    entity = db.query(model_cls).filter(model_cls.id == id).first()
    if not entity:
        return jsonify({"success": False, "message": "Account not found"}), 404

    is_active = not bool(entity.is_active)
    entity.is_active = is_active
    if hasattr(entity, 'updated_at'):
        entity.updated_at = datetime.datetime.utcnow()
    db.add(entity)
    db.commit()

    return jsonify({"success": True, "account": {**entity.to_safe_json(), "entityType": role}})

@app.route('/api/admin/users/<id>', methods=['DELETE'])
@authenticate_jwt
@require_admin_role
def admin_delete_user(id):
    db = get_db()
    role = request.args.get("role", "user")
    model_map = {
        "user": User,
        "hospital": Hospital,
        "ambulance": AmbulanceDriver,
        "police_station": PoliceStation,
        "policeman": Policeman,
        "mechanic": Mechanic,
        "insurance": InsuranceCompany,
    }
    model_cls = model_map.get(role)
    if not model_cls:
        return jsonify({"success": False, "message": "Invalid role"}), 422

    entity = db.query(model_cls).filter(model_cls.id == id).first()
    if not entity:
        return jsonify({"success": False, "message": "Account not found"}), 404

    db.delete(entity)
    db.commit()
    return jsonify({"success": True})

# ─── Notifications ───
@app.route('/api/notifications', methods=['GET'])
@authenticate_jwt
def list_notifications():
    db = get_db()
    query = db.query(Notification)
    if g.entity_role == 'user':
        query = query.filter(Notification.user_id == g.entity_id)
    else:
        query = query.filter(
            Notification.entity_id == g.entity_id,
            Notification.entity_type == g.entity_role
        )
    rows = query.order_by(desc(Notification.created_at)).limit(50).all()
    return jsonify({"success": True, "notifications": [n.to_json() for n in rows]})

# ─── Health Check ───
@app.route('/api/health', methods=['GET'])
def health_check():
    db_status = 'ok'
    try:
        if DB_DIALECT == 'mongodb':
            # Ping MongoDB to verify connectivity
            mongo_db.command('ping')
        else:
            db = SessionLocal()
            try:
                db.execute("SELECT 1")
            finally:
                db.close()
    except Exception:
        db_status = 'error'
        
    return jsonify({
        "status": "healthy" if db_status == "ok" else "degraded",
        "app": "AapadBandhav",
        "version": "1.0.0",
        "environment": os.getenv("NODE_ENV", "development"),
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "database": db_status
    }), 200 if db_status == "ok" else 503


# ─── Static files serving (in production) ───
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    # Only serve frontend static files if NODE_ENV is production and path does not start with api
    if os.getenv("NODE_ENV") == "production":
        frontend_build = os.path.abspath(os.path.join(os.path.dirname(__file__), '../frontend/dist'))
        if path != "" and os.path.exists(os.path.join(frontend_build, path)):
            return send_from_directory(frontend_build, path)
        else:
            return send_from_directory(frontend_build, 'index.html')
    return jsonify({"success": False, "message": "Backend API is running. Switch to development port 3000 to view React app."}), 404

# ─── Socket.IO Sockets Event handlers ──────────────────────────────────────────

connected_entities = {} # socket_id -> {entity_id, entity_type}

@socketio.on('connect')
def socket_connect():
    print(f"Socket connected: {request.sid}")

@socketio.on('entity:register')
def socket_register(data):
    entity_id = data.get("entityId")
    entity_type = data.get("entityType")
    if not entity_id or not entity_type:
        return
        
    connected_entities[request.sid] = {"entityId": entity_id, "entityType": entity_type}
    join_room(f"entity:{entity_id}")
    join_room(f"type:{entity_type}")
    
    print(f"Registered: {entity_type} [{entity_id}]")
    emit('entity:registered', {"success": True, "socketId": request.sid})
    emit('entity:online', {"entityId": entity_id, "entityType": entity_type, "timestamp": datetime.datetime.utcnow().isoformat()}, broadcast=True)

@socketio.on('location:update')
def socket_location_update(data):
    entity_id = data.get("entityId")
    entity_type = data.get("entityType")
    lat = data.get("latitude")
    lng = data.get("longitude")
    speed = data.get("speed", 0.0)
    heading = data.get("heading", 0.0)
    accuracy = data.get("accuracy", 0.0)
    
    if not entity_id or lat is None or lng is None:
        return
        
    db = SessionLocal()
    try:
        live_loc = LiveLocation(
            entity_id=entity_id,
            entity_type=entity_type,
            latitude=lat,
            longitude=lng,
            speed=speed,
            heading=heading,
            accuracy=accuracy
        )
        db.add(live_loc)
        
        # Update entity's last location
        if entity_type == 'user':
            db.query(User).filter(User.id == entity_id).update({
                "last_location_lat": lat,
                "last_location_lng": lng,
                "last_seen": datetime.datetime.utcnow()
            })
        elif entity_type == 'ambulance':
            db.query(AmbulanceDriver).filter(AmbulanceDriver.id == entity_id).update({
                "latitude": lat,
                "longitude": lng,
                "last_seen": datetime.datetime.utcnow()
            })
        elif entity_type == 'policeman':
            db.query(Policeman).filter(Policeman.id == entity_id).update({
                "latitude": lat,
                "longitude": lng,
                "last_seen": datetime.datetime.utcnow()
            })
        elif entity_type == 'mechanic':
            db.query(Mechanic).filter(Mechanic.id == entity_id).update({
                "latitude": lat,
                "longitude": lng,
                "last_seen": datetime.datetime.utcnow()
            })
        db.commit()
        
        payload = {
            "entityId": entity_id,
            "entityType": entity_type,
            "latitude": float(lat),
            "longitude": float(lng),
            "speed": speed,
            "heading": heading,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        
        # Broadcast to admin
        emit('location:update', payload, to='type:admin')
        # Broadcast location to others
        emit('entity:location', {
            "entityId": entity_id,
            "entityType": entity_type,
            "latitude": float(lat),
            "longitude": float(lng),
            "speed": speed,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }, broadcast=True, include_self=False)
        
    except Exception as e:
        db.rollback()
        print(f"Location update error: {e}")
    finally:
        db.close()

@socketio.on('alert:acknowledge')
def socket_alert_acknowledge(data):
    alert_id = data.get("alertId")
    accident_id = data.get("accidentId")
    action = data.get("action")
    entity_id = data.get("entityId")
    entity_type = data.get("entityType")
    eta = data.get("eta")
    
    db = SessionLocal()
    try:
        if alert_id:
            db.query(Alert).filter(Alert.id == alert_id).update({
                "status": "accepted" if action == "accepted" else "rejected",
                "responded_at": datetime.datetime.utcnow()
            })
            
        ack = Acknowledgement(
            accident_id=accident_id,
            alert_id=alert_id,
            responder_id=entity_id,
            responder_type=entity_type,
            action=action,
            eta_minutes=eta
        )
        db.add(ack)
        
        if action == 'accepted':
            db.query(Accident).filter(Accident.id == accident_id).update({
                "status": "responded",
                "responder_id": entity_id,
                "responder_type": entity_type
            })
            
            payload = {
                "accidentId": accident_id,
                "entityId": entity_id,
                "entityType": entity_type,
                "eta": eta,
                "action": "accepted",
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
            emit(f"accident:{accident_id}:responded", payload, broadcast=True)
            emit("accident:responded", payload, broadcast=True)
            emit('accident:acknowledged', {
                "accidentId": accident_id,
                "entityId": entity_id,
                "entityType": entity_type,
                "action": action,
                "eta": eta
            }, to='type:admin')
            
        db.commit()
        emit('alert:ack:success', {"success": True, "action": action})
    except Exception as e:
        db.rollback()
        emit('alert:ack:error', {"success": False, "message": str(e)})
    finally:
        db.close()

@socketio.on('accident:watch')
def socket_accident_watch(data):
    accident_id = data.get("accidentId")
    if accident_id:
        join_room(f"accident:{accident_id}")
        emit('accident:watching', {"accidentId": accident_id})

@socketio.on('message:send')
def socket_message_send(data):
    to_entity_id = data.get("toEntityId")
    from_entity_id = data.get("fromEntityId")
    message = data.get("message")
    accident_id = data.get("accidentId")
    
    emit('message:received', {
        "fromEntityId": from_entity_id,
        "message": message,
        "accidentId": accident_id,
        "timestamp": datetime.datetime.utcnow().isoformat()
    }, to=f"entity:{to_entity_id}")

@socketio.on('disconnect')
def socket_disconnect():
    entity = connected_entities.pop(request.sid, None)
    if entity:
        emit('entity:offline', {"entityId": entity["entityId"], "entityType": entity["entityType"]}, broadcast=True)
    print(f"Socket disconnected: {request.sid}")

@socketio.on('test:trigger_broadcast')
def socket_test_trigger_broadcast(data):
    if data and data.get("isTest"):
        emit('accident:new', data, broadcast=True)

@socketio.on('ping')
def socket_ping():
    emit('pong', {"timestamp": datetime.datetime.utcnow().isoformat()})

if __name__ == '__main__':
    PORT = int(os.getenv("PORT", 5000))
    print(f"AapadBandhav Python API running on port {PORT} [flask-socketio]")
    socketio.run(app, host='0.0.0.0', port=PORT, debug=False, allow_unsafe_werkzeug=True)
