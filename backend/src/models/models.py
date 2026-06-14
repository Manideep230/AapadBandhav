import uuid
import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime,
    Text, ForeignKey, Numeric, JSON
)
from src.config.db import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = 'users'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    unique_id = Column(String(10), unique=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    mobile = Column(String(15), unique=True, nullable=False)
    password = Column(String(255), nullable=True)
    vehicle_number = Column(String(20), nullable=True)
    vehicle_type = Column(String(20), default='Car')
    address = Column(Text, nullable=True)
    blood_group = Column(String(20), default='Unknown')
    age = Column(Integer, nullable=True)
    gender = Column(String(50), default='Prefer not to say')
    profile_photo = Column(String(500), nullable=True)
    role = Column(String(20), default='user')
    is_active = Column(Boolean, default=True)
    is_available = Column(Boolean, default=True)
    last_location_lat = Column(Numeric(10, 8), nullable=True)
    last_location_lng = Column(Numeric(11, 8), nullable=True)
    last_seen = Column(DateTime, nullable=True)
    fcm_token = Column(String(255), nullable=True)
    mobile_verified = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    department = Column(String(100), nullable=True)
    rank = Column(String(50), nullable=True)
    permissions = Column(JSON, nullable=True)
    created_by = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    @property
    def latitude(self):
        return float(self.last_location_lat) if self.last_location_lat is not None else None

    @latitude.setter
    def latitude(self, val):
        self.last_location_lat = val

    @property
    def longitude(self):
        return float(self.last_location_lng) if self.last_location_lng is not None else None

    @longitude.setter
    def longitude(self, val):
        self.last_location_lng = val

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
            "is_available": self.is_available,
            "mobile_verified": self.mobile_verified,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "department": self.department,
            "rank": self.rank,
            "permissions": self.permissions,
            "created_by": self.created_by,
            "last_location_lat": float(self.last_location_lat) if self.last_location_lat is not None else None,
            "last_location_lng": float(self.last_location_lng) if self.last_location_lng is not None else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "fcm_token": self.fcm_token
        }

class Device(Base):
    __tablename__ = 'devices'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(16), unique=True, nullable=False)
    pass_name = Column(String(8), unique=True, nullable=True)
    pass_code = Column(String(8), nullable=True)
    sim_code = Column(String(13), unique=True, nullable=True)
    qr_code = Column(String(100), nullable=True)
    owner_id = Column(String(36), ForeignKey('users.id'), nullable=True)
    is_active = Column(Boolean, default=True)
    is_linked = Column(Boolean, default=False)
    linked_at = Column(DateTime, nullable=True)
    firmware_version = Column(String(20), default='1.0.0')
    last_ping = Column(DateTime, nullable=True)
    battery_level = Column(Integer, default=100)
    status = Column(String(50), default='inactive')
    current_speed = Column(Float, default=0.0)
    average_speed = Column(Float, default=0.0)
    peak_speed = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "device_code": self.device_id,
            "pass_name": self.pass_name,
            "pass_code": self.pass_code,
            "sim_code": self.sim_code,
            "qr_code": self.qr_code,
            "owner_id": self.owner_id,
            "is_active": self.is_active,
            "is_linked": self.is_linked,
            "linked_at": self.linked_at.isoformat() if self.linked_at else None,
            "firmware_version": self.firmware_version,
            "last_ping": self.last_ping.isoformat() if self.last_ping else None,
            "battery_level": self.battery_level,
            "status": self.status,
            "current_speed": self.current_speed,
            "average_speed": self.average_speed,
            "peak_speed": self.peak_speed
        }

class Hospital(Base):
    __tablename__ = 'hospitals'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    password = Column(String(255), nullable=True)
    mobile = Column(String(15), unique=True, nullable=False, index=True)
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
    mobile_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
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
            "fcm_token": self.fcm_token,
            "mobile_verified": self.mobile_verified,
            "last_login": self.last_login.isoformat() if self.last_login else None
        }

class AmbulanceDriver(Base):
    __tablename__ = 'ambulance_drivers'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    password = Column(String(255), nullable=True)
    mobile = Column(String(15), unique=True, nullable=False, index=True)
    license_number = Column(String(100), nullable=True)
    vehicle_number = Column(String(50), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    is_available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime, nullable=True)
    fcm_token = Column(String(255), nullable=True)
    mobile_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    organization = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "license_number": self.license_number,
            "vehicle_number": self.vehicle_number,
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
            "is_available": self.is_available,
            "is_active": self.is_active,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "fcm_token": self.fcm_token,
            "mobile_verified": self.mobile_verified,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "organization": self.organization
        }

class PoliceStation(Base):
    __tablename__ = 'police_stations'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    password = Column(String(255), nullable=True)
    mobile = Column(String(15), unique=True, nullable=False, index=True)
    station_code = Column(String(50), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    is_available = Column(Boolean, default=True)
    fcm_token = Column(String(255), nullable=True)
    mobile_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "station_code": self.station_code,
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
            "address": self.address,
            "city": self.city,
            "state": self.state,
            "is_active": self.is_active,
            "is_available": self.is_available,
            "fcm_token": self.fcm_token,
            "mobile_verified": self.mobile_verified,
            "last_login": self.last_login.isoformat() if self.last_login else None
        }

class Policeman(Base):
    __tablename__ = 'policemen'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    password = Column(String(255), nullable=True)
    mobile = Column(String(15), unique=True, nullable=False, index=True)
    badge_number = Column(String(50), nullable=True)
    station_id = Column(String(36), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    is_available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    status = Column(String(20), default='available')
    last_seen = Column(DateTime, nullable=True)
    fcm_token = Column(String(255), nullable=True)
    mobile_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    department = Column(String(100), nullable=True)
    rank = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "badge_number": self.badge_number,
            "station_id": self.station_id,
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
            "is_available": self.is_available,
            "is_active": self.is_active,
            "status": self.status,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "fcm_token": self.fcm_token,
            "mobile_verified": self.mobile_verified,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "department": self.department,
            "rank": self.rank
        }

class Mechanic(Base):
    __tablename__ = 'mechanics'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    password = Column(String(255), nullable=True)
    mobile = Column(String(15), unique=True, nullable=False, index=True)
    specialization = Column(String(200), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    is_available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime, nullable=True)
    rating = Column(Float, default=4.0)
    fcm_token = Column(String(255), nullable=True)
    mobile_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_safe_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "specialization": self.specialization,
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
            "is_available": self.is_available,
            "is_active": self.is_active,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "rating": self.rating,
            "fcm_token": self.fcm_token,
            "mobile_verified": self.mobile_verified,
            "last_login": self.last_login.isoformat() if self.last_login else None
        }

class InsuranceCompany(Base):
    __tablename__ = 'insurance_companies'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    password = Column(String(255), nullable=True)
    mobile = Column(String(15), unique=True, nullable=False, index=True)
    license_number = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    is_active = Column(Boolean, default=True)
    fcm_token = Column(String(255), nullable=True)
    mobile_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
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
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
            "is_active": self.is_active,
            "fcm_token": self.fcm_token,
            "mobile_verified": self.mobile_verified,
            "last_login": self.last_login.isoformat() if self.last_login else None
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

    def to_json(self):
        return {
            "id": self.id,
            "accident_id": self.accident_id,
            "from_entity_id": self.from_entity_id,
            "from_entity_type": self.from_entity_type,
            "to_lat": float(self.to_lat) if self.to_lat is not None else None,
            "to_lng": float(self.to_lng) if self.to_lng is not None else None,
            "distance_km": float(self.distance_km) if self.distance_km is not None else None,
            "eta_minutes": self.eta_minutes,
            "route_points": self.route_points,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


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

class OTPVerification(Base):
    __tablename__ = 'otp_verifications'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    mobile = Column(String(15), nullable=False, index=True)
    otp_hash = Column(String(255), nullable=False)
    attempts = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    verified = Column(Boolean, default=False)

class VehicleInformation(Base):
    __tablename__ = 'vehicle_information'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    device_id = Column(String(36), ForeignKey('devices.id'), nullable=False)
    vehicle_type = Column(String(50), nullable=False)
    vehicle_number = Column(String(50), nullable=False)
    vehicle_model = Column(String(100), nullable=True)
    manufacturer = Column(String(100), nullable=True)
    year = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "device_id": self.device_id,
            "vehicle_type": self.vehicle_type,
            "vehicle_number": self.vehicle_number,
            "vehicle_model": self.vehicle_model,
            "manufacturer": self.manufacturer,
            "year": self.year,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class DeviceShare(Base):
    __tablename__ = 'device_shares'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(36), ForeignKey('devices.id'), nullable=False)
    user_id = Column(String(36), ForeignKey('users.id'), nullable=False)
    role = Column(String(20), default='viewer')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "user_id": self.user_id,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class IoTNode(Base):
    __tablename__ = 'iot_nodes'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(36), ForeignKey('devices.id'), nullable=False)
    node_id = Column(String(10), nullable=False)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    speed = Column(Float, default=0.0)
    impact_value = Column(Float, default=0.0)
    sensor_status = Column(String(50), default='active')
    battery_status = Column(Float, default=100.0)
    last_seen = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "node_id": self.node_id,
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
            "speed": self.speed,
            "impact_value": self.impact_value,
            "sensor_status": self.sensor_status,
            "battery_status": self.battery_status,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None
        }

class GPSSpeedLog(Base):
    __tablename__ = 'gps_speed_logs'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(36), ForeignKey('devices.id'), nullable=False)
    latitude = Column(Numeric(10, 8), nullable=False)
    longitude = Column(Numeric(11, 8), nullable=False)
    speed = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "latitude": float(self.latitude),
            "longitude": float(self.longitude),
            "speed": self.speed,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }

class EmergencySMSLog(Base):
    __tablename__ = 'emergency_sms_logs'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    accident_id = Column(String(36), ForeignKey('accidents.id'), nullable=True)
    recipient_name = Column(String(100), nullable=False)
    recipient_mobile = Column(String(15), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(50), default='sent')
    attempts = Column(Integer, default=1)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "accident_id": self.accident_id,
            "recipient_name": self.recipient_name,
            "recipient_mobile": self.recipient_mobile,
            "message": self.message,
            "status": self.status,
            "attempts": self.attempts,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(36), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "action": self.action,
            "details": self.details,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class RestSegment(Base):
    __tablename__ = 'rest_segments'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(50), nullable=False)
    latitude = Column(Numeric(10, 8), nullable=False)
    longitude = Column(Numeric(11, 8), nullable=False)
    stop_number = Column(Integer, default=1)
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    stop_duration_seconds = Column(Integer, nullable=True)
    
    travel_path = Column(JSON, nullable=True)
    travel_distance_km = Column(Numeric(6, 2), default=0.0)
    travel_duration_seconds = Column(Integer, default=0)
    avg_speed_kmh = Column(Numeric(5, 2), default=0.0)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
            "stop_number": self.stop_number,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "stop_duration_seconds": self.stop_duration_seconds,
            "travel_path": self.travel_path,
            "travel_distance_km": float(self.travel_distance_km) if self.travel_distance_km is not None else 0.0,
            "travel_duration_seconds": self.travel_duration_seconds,
            "avg_speed_kmh": float(self.avg_speed_kmh) if self.avg_speed_kmh is not None else 0.0,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class AccidentStatusLog(Base):
    __tablename__ = 'accident_logs'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    accident_id = Column(String(36), ForeignKey('accidents.id'), nullable=False)
    status = Column(String(50), nullable=False)  # one of the 12 states
    responder_id = Column(String(36), nullable=True)
    responder_type = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "accident_id": self.accident_id,
            "status": self.status,
            "responder_id": self.responder_id,
            "responder_type": self.responder_type,
            "notes": self.notes,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }

class AccidentReport(Base):
    __tablename__ = 'accident_reports'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    accident_id = Column(String(36), ForeignKey('accidents.id'), nullable=False)
    responder_id = Column(String(36), nullable=False)
    responder_type = Column(String(50), nullable=False)
    field_report = Column(Text, nullable=True)
    victim_status = Column(String(50), nullable=True)  # Located, Stabilized, Transporting, Resolved
    severity = Column(String(50), nullable=True)
    evidence_urls = Column(JSON, nullable=True)  # list of URLs
    actions_taken = Column(Text, nullable=True)
    additional_support_requested = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "accident_id": self.accident_id,
            "responder_id": self.responder_id,
            "responder_type": self.responder_type,
            "field_report": self.field_report,
            "victim_status": self.victim_status,
            "severity": self.severity,
            "evidence_urls": self.evidence_urls,
            "actions_taken": self.actions_taken,
            "additional_support_requested": self.additional_support_requested,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }

class IncidentMessage(Base):
    __tablename__ = 'incident_messages'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    accident_id = Column(String(36), ForeignKey('accidents.id'), nullable=False)
    sender_id = Column(String(36), nullable=False)
    sender_type = Column(String(50), nullable=False)
    sender_name = Column(String(100), nullable=False)
    message_type = Column(String(20), default='text')  # text, photo, voice
    content = Column(Text, nullable=False)  # message text or file URL
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "accident_id": self.accident_id,
            "sender_id": self.sender_id,
            "sender_type": self.sender_type,
            "sender_name": self.sender_name,
            "messageType": self.message_type,
            "content": self.content,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }

class EmergencyResource(Base):
    __tablename__ = 'emergency_resources'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)  # ambulance, police_car, fire_truck, rescue_unit
    vehicle_number = Column(String(50), nullable=False)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)
    status = Column(String(50), default='available')  # available, assigned, maintenance
    current_assignment_id = Column(String(36), ForeignKey('accidents.id'), nullable=True)
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_json(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "vehicle_number": self.vehicle_number,
            "latitude": float(self.latitude) if self.latitude is not None else None,
            "longitude": float(self.longitude) if self.longitude is not None else None,
            "status": self.status,
            "current_assignment_id": self.current_assignment_id,
            "isActive": self.is_active,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None
        }



