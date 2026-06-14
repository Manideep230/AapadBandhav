import os
import datetime
import jwt
from functools import wraps
from flask import request, jsonify, g
from src.config.db import DB_DIALECT, get_db
from src.models.models import (
    User, Hospital, AmbulanceDriver, PoliceStation, Policeman, Mechanic, InsuranceCompany
)

def verify_token(token: str) -> dict:
    secret = os.getenv("JWT_SECRET", "change_this_to_a_minimum_64_char_random_secret_in_production")
    return jwt.decode(token, secret, algorithms=['HS256'])

# Authentication Decorator
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
        
        if role in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
            entity = db.query(User).filter(User.id == g.entity_id).first()
            if entity: g.user = entity
        elif role in ('admin', 'superadmin'):
            if g.entity_id == 'admin-001':
                entity = type('Admin', (), {
                    'id': 'admin-001',
                    'role': 'superadmin',
                    'is_active': True,
                    'full_name': 'System Administrator',
                    'permissions': [
                        "manage_users", "manage_devices", "manage_vehicles",
                        "manage_police", "manage_reports", "manage_documentation"
                    ]
                })()
                g.user = entity
            else:
                entity = db.query(User).filter(User.id == g.entity_id, User.role.in_(['admin', 'superadmin'])).first()
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

# Role Validation Decorators
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
        if not hasattr(g, 'user') or getattr(g.user, 'role', None) not in ('admin', 'superadmin'):
            return jsonify({"success": False, "message": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated

def require_superadmin_role(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(g, 'user') or getattr(g.user, 'role', None) != 'superadmin':
            return jsonify({"success": False, "message": "Super Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated

