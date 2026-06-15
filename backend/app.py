import os
import re
import math
import uuid
import json
import random
import string
import hashlib
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
    re.compile(r"^https?://127\.0\.0\.1(:\d+)?$"),
    re.compile(r"^https?://.*\.vercel\.app$"),
    re.compile(r"^https?://.*\.devtunnels\.ms$"),
    re.compile(r"^https?://192\.168\.\d+\.\d+(:\d+)?$"),
    re.compile(r"^https?://10\.\d+\.\d+\.\d+(:\d+)?$"),
    re.compile(r"^https?://172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$"),
    re.compile(r"^https?://.*\.local(:\d+)?$"),
    re.compile(r"^https?://.*\.ngrok-free\.app$"),
    re.compile(r"^https?://.*\.ngrok\.io$"),
    re.compile(r"^https?://.*\.up\.railway\.app$")
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
    
    # Auto-allow same-domain requests by comparing origin host to request host
    try:
        from urllib.parse import urlparse
        parsed_origin = urlparse(origin)
        origin_hostname = parsed_origin.hostname
        
        # Get request Host header
        from flask import request
        req_host = request.headers.get("Host")
        if req_host:
            # Host header can contain port, strip it
            req_hostname = req_host.split(":")[0]
            if origin_hostname == req_hostname:
                return True
    except Exception:
        pass

    for pattern in cors_patterns:
        if pattern.match(origin):
            return True
    return False

CORS(app, resources={r"/*": {"origins": cors_patterns}}, supports_credentials=True)

# Socket.IO Setup — Production-Grade Configuration
# ping_interval: server sends a ping every 20s (mobile-friendly)
# ping_timeout: client considered disconnected if no pong within 15s
# max_http_buffer_size: prevent large payload rejections (1MB)
# async_handlers: non-blocking event handler execution
_socketio_kwargs = dict(
    cors_allowed_origins=check_cors_origin,
    ping_interval=20,
    ping_timeout=15,
    max_http_buffer_size=1_000_000,
    async_handlers=True,
    logger=False,
    engineio_logger=False,
)
redis_url = os.getenv("REDIS_URL")
if redis_url:
    # Use Redis backend message queue to support horizontal scaling (multiple Gunicorn workers)
    socketio = SocketIO(app, message_queue=redis_url, **_socketio_kwargs)
    print("Socket.IO initialized with Redis message queue.")
else:
    socketio = SocketIO(app, **_socketio_kwargs)

# Global reference to the MQTT client for health monitoring
mqtt_client = None

# ─── Decoupled Database & Model Layers ─────────────────────────────────────────
from src.config.db import Base, engine, SessionLocal, DB_DIALECT
from src.models.models import (
    User, Device, Hospital, AmbulanceDriver, PoliceStation, Policeman, Mechanic,
    InsuranceCompany, InsuranceCustomer, EmergencyContact, Accident, Alert,
    Notification, LiveLocation, Route, Acknowledgement, OTPVerification,
    VehicleInformation, DeviceShare, IoTNode, GPSSpeedLog, EmergencySMSLog, AuditLog,
    RestSegment, AccidentStatusLog, AccidentReport, IncidentMessage, EmergencyResource
)

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

# Create tables
Base.metadata.create_all(bind=engine)
# Re-export MongoDB components if any
from src.config.db import MongoSession
try:
    from src.config.db import mongo_db
except ImportError:
    mongo_db = None

# Auto-seed on startup if DB is empty (ensures Railway fresh deployments have test data)
try:
    _db_check = SessionLocal()
    _hospital_count = _db_check.query(Hospital).count()
    _db_check.close()
    if _hospital_count == 0:
        print("📦 [AutoSeed] Database is empty — seeding test data...")
        import datetime as _dt
        import random as _rnd
        _seed_db = SessionLocal()
        try:
            _VJA = {"lat": 16.5063, "lng": 80.6480}
            def _off(b): return round(b + (_rnd.random()-0.5)*0.05, 6)
            # Hospitals
            for h in [
                {"name":"Manipal Hospital Vijayawada","mobile":"9300001111","lat":16.5060,"lng":80.6450,"beds":300,"avail":65,"spec":["Emergency","Trauma","ICU"]},
                {"name":"Andhra Hospitals",           "mobile":"9300002222","lat":16.5090,"lng":80.6510,"beds":200,"avail":40,"spec":["Emergency","Neurology"]},
                {"name":"Ramesh Hospitals",           "mobile":"9300003333","lat":16.5030,"lng":80.6420,"beds":150,"avail":25,"spec":["Emergency","General Medicine"]},
            ]:
                _seed_db.add(Hospital(name=h["name"],mobile=h["mobile"],password=None,latitude=h["lat"],longitude=h["lng"],city="Vijayawada",state="Andhra Pradesh",bed_capacity=h["beds"],available_beds=h["avail"],specializations=h["spec"],registration_number=f"AP-HOSP-{_rnd.randint(1000,9999)}",is_active=True,is_available=True,mobile_verified=True))
            # Ambulances
            for a in [
                {"name":"Ravi Ambulance Service",  "mobile":"9400001111","vehicle":"AP16AMB001"},
                {"name":"Sita Emergency Services", "mobile":"9400002222","vehicle":"AP16AMB002"},
                {"name":"Mohan Emergency Driver",  "mobile":"9400003333","vehicle":"AP16AMB003"},
            ]:
                _seed_db.add(AmbulanceDriver(name=a["name"],mobile=a["mobile"],password=None,vehicle_number=a["vehicle"],latitude=_off(_VJA["lat"]),longitude=_off(_VJA["lng"]),license_number=f"AP-DL-{_rnd.randint(1000000,9999999)}",is_active=True,is_available=True,mobile_verified=True,last_seen=_dt.datetime.utcnow()))
            # Police Stations
            _stations = []
            for s in [
                {"name":"One Town Police Station",   "mobile":"9500001111","lat":16.5074,"lng":80.6480,"code":"AP-PS-VJA-OT"},
                {"name":"Governorpet Police Station","mobile":"9500002222","lat":16.5048,"lng":80.6365,"code":"AP-PS-VJA-GP"},
                {"name":"Labbipet Police Station",   "mobile":"9500003333","lat":16.5110,"lng":80.6320,"code":"AP-PS-VJA-LP"},
            ]:
                _st = PoliceStation(name=s["name"],mobile=s["mobile"],password=None,latitude=s["lat"],longitude=s["lng"],city="Vijayawada",state="Andhra Pradesh",station_code=s["code"],address=f"{s['name']}, Vijayawada",is_active=True,is_available=True,mobile_verified=True)
                _seed_db.add(_st); _seed_db.flush(); _stations.append(_st)
            # Policemen
            for i,p in enumerate([
                {"name":"Constable Raju Reddy",  "mobile":"9600001111","badge":"AP-12345"},
                {"name":"SI Venkata Rao",         "mobile":"9600002222","badge":"AP-12346"},
                {"name":"Constable Lakshmi Devi","mobile":"9600003333","badge":"AP-12347"},
            ]):
                _seed_db.add(Policeman(name=p["name"],mobile=p["mobile"],password=None,badge_number=p["badge"],latitude=_off(_VJA["lat"]),longitude=_off(_VJA["lng"]),station_id=_stations[i%len(_stations)].id if _stations else None,is_active=True,is_available=True,mobile_verified=True,last_seen=_dt.datetime.utcnow()))
            # Mechanics
            for m in [
                {"name":"Rajesh Mechanics",    "mobile":"9700001111","spec":"Car, Motorcycle"},
                {"name":"Quick Fix Auto Works","mobile":"9700002222","spec":"All vehicles"},
                {"name":"Vijay Auto Garage",   "mobile":"9700003333","spec":"Heavy vehicles"},
            ]:
                _seed_db.add(Mechanic(name=m["name"],mobile=m["mobile"],password=None,specialization=m["spec"],latitude=_off(_VJA["lat"]),longitude=_off(_VJA["lng"]),is_active=True,is_available=True,mobile_verified=True,last_seen=_dt.datetime.utcnow()))
            # Insurance
            for ins in [
                {"name":"Safe Drive Insurance","mobile":"9800001111","lic":"IRDAI-AP-123456"},
                {"name":"NighaTech Insure Co.","mobile":"9800002222","lic":"IRDAI-AP-123457"},
                {"name":"AP Road Shield",      "mobile":"9800003333","lic":"IRDAI-AP-123458"},
            ]:
                _seed_db.add(InsuranceCompany(name=ins["name"],mobile=ins["mobile"],password=None,license_number=ins["lic"],latitude=_off(_VJA["lat"]),longitude=_off(_VJA["lng"]),city="Vijayawada",address="MG Road, Vijayawada",is_active=True,mobile_verified=True))
            _seed_db.commit()
            print("📦 [AutoSeed] ✅ Seeded: 3 hospitals, 3 ambulances, 3 police stations, 3 policemen, 3 mechanics, 3 insurance")
        except Exception as _se:
            _seed_db.rollback()
            print(f"📦 [AutoSeed] ❌ Failed: {_se}")
            import traceback; traceback.print_exc()
        finally:
            _seed_db.close()
    else:
        print(f"📦 [AutoSeed] Skipped — {_hospital_count} hospitals already exist.")
except Exception as _seed_err:
    print(f"⚠️ [AutoSeed] Error: {_seed_err}")

# Re-export Auth/Crypt Utilities and Decorators
from src.utils.auth_helpers import authenticate_jwt, require_user_role, require_admin_role, require_superadmin_role, verify_token
from src.services.services import (
    hash_password, check_password, generate_token, process_gps_speed_and_logs, haversine_distance
)

from src.routes.auth import auth_bp
from src.routes.admin import admin_bp
from src.routes.devices import devices_bp
from src.routes.safety import safety_bp

# Register modular routes/Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(devices_bp)
app.register_blueprint(safety_bp)

# Admin authentication is now fully OTP-based.
# Set ADMIN_MOBILE env var to the admin's mobile number.
# When that mobile logs in via /api/auth/otp/verify, the system
# automatically returns a superadmin token (see services.py).


def estimate_eta(distance_km, avg_speed_kmh=40):
    return int(round((distance_km / avg_speed_kmh) * 60))

def log_accident_status(db, accident_id, status, responder_id=None, responder_type=None, notes=None):
    log_entry = AccidentStatusLog(
        accident_id=accident_id,
        status=status,
        responder_id=responder_id,
        responder_type=responder_type,
        notes=notes
    )
    db.add(log_entry)
    db.commit()
    
    payload = {
        "accidentId": accident_id,
        "status": status,
        "responderId": responder_id,
        "responderType": responder_type,
        "notes": notes,
        "timestamp": datetime.datetime.utcnow().isoformat()
    }
    socketio.emit(f"accident:{accident_id}:status_change", payload)
    socketio.emit("accident:status_change", payload)
    return log_entry

def audit_action(action_type):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            response = f(*args, **kwargs)
            try:
                db = get_db()
                entity_id = getattr(g, 'entity_id', None)
                entity_role = getattr(g, 'entity_role', None)
                if not entity_id and hasattr(g, 'user') and g.user:
                    entity_id = g.user.id
                    entity_role = getattr(g, 'user_role', g.user.role if hasattr(g.user, 'role') else 'user')
                
                if entity_id:
                    ip = request.remote_addr
                    user_agent = request.headers.get('User-Agent')
                    gps_lat = None
                    gps_lng = None
                    if request.is_json:
                        body = request.json or {}
                        gps_lat = body.get('latitude') or body.get('lat')
                        gps_lng = body.get('longitude') or body.get('lng')
                    
                    details = {
                        "ip": ip,
                        "user_agent": user_agent,
                        "gps": {"latitude": gps_lat, "longitude": gps_lng} if (gps_lat is not None and gps_lng is not None) else None,
                        "url": request.url,
                        "method": request.method,
                        "args": request.view_args,
                        "params": request.args.to_dict()
                    }
                    
                    log = AuditLog(
                        entity_type=entity_role or 'unknown',
                        entity_id=entity_id,
                        action=action_type,
                        details=json.dumps(details)
                    )
                    db.add(log)
                    db.commit()
            except Exception as e:
                print(f"Audit logging failed: {e}")
            return response
        return decorated_function
    return decorator


def find_nearby_entities(acc_lat, acc_lon, entities, radius_km):
    nearby = []
    skipped_no_coords = 0
    for entity in entities:
        lat = float(entity.latitude) if entity.latitude is not None else None
        lon = float(entity.longitude) if entity.longitude is not None else None
        if lat is None or lon is None:
            skipped_no_coords += 1
            continue
        dist = haversine_distance(acc_lat, acc_lon, lat, lon)
        if dist <= radius_km:
            entity_dict = entity.to_safe_json() if hasattr(entity, 'to_safe_json') else entity.to_json()
            entity_dict['distance_km'] = round(dist, 2)
            nearby.append(entity_dict)
    if skipped_no_coords:
        print(f"⚠️  [Dispatch] {skipped_no_coords} entity/entities skipped — no GPS coordinates set. Ensure they update location after login.")
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

def send_sms(mobile, message_body, accident_id=None):
    secret = os.getenv("SMS_SECRET", "dummy_secret")
    sender = os.getenv("SMS_SENDER", "AapadB")
    tempid = os.getenv("SMS_TEMPID", "dummy_temp_id")
    route = os.getenv("SMS_ROUTE", "dummy_route")
    msgtype = os.getenv("SMS_MSGTYPE", "text")
    
    url = "https://43.252.88.250/index.php/smsapi/httpapi/"
    
    db = SessionLocal()
    sms_log = None
    if accident_id:
        contact = db.query(EmergencyContact).filter(EmergencyContact.mobile == mobile).first()
        contact_name = contact.contact_name if contact else "Emergency Contact"
        sms_log = EmergencySMSLog(
            accident_id=accident_id,
            recipient_name=contact_name,
            recipient_mobile=mobile,
            message=message_body,
            status='sending',
            attempts=0
        )
        db.add(sms_log)
        db.commit()
    
    success = False
    attempts = 0
    error_msg = None
    
    import requests
    from urllib3.exceptions import InsecureRequestWarning
    requests.packages.urllib3.disable_warnings(category=InsecureRequestWarning)
    
    while attempts < 3 and not success:
        attempts += 1
        try:
            params = {
                "secret": secret,
                "sender": sender,
                "tempid": tempid,
                "receiver": mobile,
                "route": route,
                "msgtype": msgtype,
                "sms": message_body
            }
            response = requests.get(url, params=params, verify=False, timeout=5)
            if response.status_code == 200:
                success = True
                print(f"📱 [SMS Gateway Success] To: {mobile} | Attempt: {attempts} | Response: {response.text}")
            else:
                error_msg = f"Non-200 status code: {response.status_code} - {response.text}"
                print(f"⚠️ [SMS Gateway Error] To: {mobile} | Attempt: {attempts} | Response: {response.text}")
        except Exception as e:
            error_msg = str(e)
            print(f"❌ [SMS Gateway Failed] To: {mobile} | Attempt: {attempts} | Error: {e}")
            import time
            time.sleep(0.5)
            
    if sms_log:
        sms_log.status = 'sent' if success else 'failed'
        sms_log.attempts = attempts
        sms_log.error_message = error_msg if not success else None
        db.add(sms_log)
        db.commit()
        
    db.close()
    return success

# ─── Dispatch Pipeline ────────────────────────────────────────────────────────

def run_phase_dispatch(accident_id, radius_km, phase):
    db = SessionLocal()
    try:
        accident = db.query(Accident).filter(Accident.id == accident_id).first()
        if not accident or accident.status not in ['active', 'dispatched']:
            return
            
        print(f"⚡ Running Phase {phase} dispatch for accident {accident.accident_code} (Radius: {radius_km}km)")
        if phase == 2:
            socketio.emit('accident:phase2', {
                "accidentId": accident.id,
                "code": accident.accident_code,
                "radiusKm": radius_km,
                "timestamp": datetime.datetime.utcnow().isoformat()
            })
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
            sms_body = f"AapadBandhav Emergency Alert\n\nAccident detected for:\nName: {user.full_name}\nMobile: {user.mobile}\nLocation: {round(lat, 5)}°N, {round(lng, 5)}°E\nTime: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n\nPlease contact the person immediately.\n\nThank You,\nTeam NighaTech Global Pvt Ltd"
            send_sms(contact.mobile, sms_body, accident_id=accident.id)
            
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
                "user": user.to_safe_json(),
                "victim": user.to_safe_json()
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
                "user": user.to_safe_json(),
                "victim": user.to_safe_json()
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
                "user": user.to_safe_json(),
                "victim": user.to_safe_json()
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
                "user": user.to_safe_json(),
                "victim": user.to_safe_json()
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
                "user": user.to_safe_json(),
                "victim": user.to_safe_json()
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
                "user": user.to_safe_json(),
                "victim": user.to_safe_json()
            }, to=f"entity:{ins_link.insurance_id}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{ins_link.insurance_id}")
            ins_co = db.query(InsuranceCompany).filter(InsuranceCompany.id == ins_link.insurance_id).first()
            if ins_co and ins_co.fcm_token:
                send_push_notification(ins_co.fcm_token, "🚨 CLAIM ALERT", f"Your insured customer {user.full_name} (Vehicle: {accident.vehicle_number}) has been in an accident.", {"accidentId": accident.id})

        # 8. Nearby Fire Departments
        fire_personnel = db.query(User).filter(User.role == 'fire_department', User.is_active == True, User.is_available == True).all()
        nearby_fire = find_nearby_entities(lat, lng, fire_personnel, radius_km)
        for fire in nearby_fire[:3]:
            eta = estimate_eta(fire['distance_km'], 55)
            msg = f"🔥 FIRE/ACCIDENT ALERT | User: {user.full_name} | Vehicle: {accident.vehicle_number} | Distance: {fire['distance_km']}km | ETA: {eta}min"
            alert = Alert(
                accident_id=accident.id,
                recipient_id=fire['id'],
                recipient_type='fire_department',
                message=msg,
                phase=phase,
                distance_km=fire['distance_km'],
                eta_minutes=eta,
                status='sent'
            )
            db.add(alert)
            db.flush()
            socketio.emit(f"entity:{fire['id']}:alert", {
                "type": "accident_alert",
                "alert": alert.to_json(),
                "accident": accident.to_json(),
                "user": user.to_safe_json(),
                "victim": user.to_safe_json()
            }, to=f"entity:{fire['id']}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{fire['id']}")
            if fire.get('fcm_token'):
                send_push_notification(fire['fcm_token'], "🔥 FIRE/ACCIDENT ALERT", msg, {"accidentId": accident.id})

        # 9. Nearby AB Volunteers
        volunteers = db.query(User).filter(User.role == 'volunteer', User.is_active == True, User.is_available == True).all()
        nearby_volunteers = find_nearby_entities(lat, lng, volunteers, radius_km)
        for vol in nearby_volunteers[:5]:
            eta = estimate_eta(vol['distance_km'], 40)
            msg = f"🤝 VOLUNTEER EMERGENCY | User: {user.full_name} | Vehicle: {accident.vehicle_number} | Distance: {vol['distance_km']}km | ETA: {eta}min"
            alert = Alert(
                accident_id=accident.id,
                recipient_id=vol['id'],
                recipient_type='volunteer',
                message=msg,
                phase=phase,
                distance_km=vol['distance_km'],
                eta_minutes=eta,
                status='sent'
            )
            db.add(alert)
            db.flush()
            socketio.emit(f"entity:{vol['id']}:alert", {
                "type": "accident_alert",
                "alert": alert.to_json(),
                "accident": accident.to_json(),
                "user": user.to_safe_json(),
                "victim": user.to_safe_json()
            }, to=f"entity:{vol['id']}")
            socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{vol['id']}")
            if vol.get('fcm_token'):
                send_push_notification(vol['fcm_token'], "🤝 VOLUNTEER EMERGENCY", msg, {"accidentId": accident.id})

        accident.status = 'dispatched'
        db.add(accident)
        db.commit()

        total_alerts = (
            len(nearby_hospitals[:3]) + len(nearby_ambulances[:3]) +
            len(nearby_stations[:2]) + len(nearby_policemen[:3]) +
            len(nearby_mechanics[:2]) + len(nearby_fire[:3]) + len(nearby_volunteers[:5]) + (1 if ins_link else 0)
        )
        log_accident_status(db, accident.id, 'alert_broadcasted', notes=f"Emergency broadcasted to {total_alerts} active responders in phase {phase} within {radius_km}km.")
        print(f"✅ [Dispatch Phase {phase}] Accident {accident.accident_code}: {total_alerts} alerts sent within {radius_km}km")

        # If Phase 1 found zero service responders, immediately trigger wider radius without waiting 30s
        if phase == 1 and total_alerts == 0:
            print(f"⚠️  [Dispatch] No responders found within {radius_km}km! Auto-expanding to 50km immediately.")
            Thread(target=run_phase_dispatch, args=(accident_id, 50, 2)).start()

        # Emit dispatch completion summary
        socketio.emit('accident:dispatched', {
            "accidentId": accident.id,
            "phase": phase,
            "radiusKm": radius_km,
            "alertsSent": total_alerts,
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
        should_dispatch = False
        accident_code = None
        db = SessionLocal()
        try:
            fresh = db.query(Accident).filter(Accident.id == accident_id).first()
            if fresh and fresh.status in ('dispatched', 'alert_broadcasted', 'active'):
                should_dispatch = True
                accident_code = fresh.accident_code
                print(f"⚡ Triggering Phase 2 dispatch for {fresh.accident_code}")
        except Exception as ex:
            print(f"delayed Phase 2 DB error: {ex}")
        finally:
            db.close()

        if should_dispatch:
            run_phase_dispatch(accident_id, 25, 2)
            socketio.emit('accident:phase2', {
                "accidentId": accident_id,
                "code": accident_code,
                "message": "No response received. Expanding search radius to 25km."
            })
            
            # Schedule Phase 3 (critical escalation) after 30 more seconds (total 60s)
            def delayed_phase3():
                time.sleep(30)
                db3 = SessionLocal()
                try:
                    fresh3 = db3.query(Accident).filter(Accident.id == accident_id).first()
                    if fresh3 and fresh3.status in ('dispatched', 'alert_broadcasted', 'active'):
                        print(f"🚨 Escalating incident {fresh3.accident_code} to CRITICAL due to responder response timeout.")
                        fresh3.severity = 'critical'
                        db3.commit()
                        
                        log_accident_status(db3, accident_id, 'alert_broadcasted', notes="Escalation Phase 3: Severity escalated to CRITICAL due to responder response timeout.")
                        
                        # Re-dispatch at maximum 50km radius
                        run_phase_dispatch(accident_id, 50, 3)
                        
                        socketio.emit('accident:escalated', {
                            "accidentId": accident_id,
                            "code": fresh3.accident_code,
                            "severity": "critical",
                            "message": "CRITICAL ESCALATION: No responder accepted the alert within 60 seconds."
                        })
                except Exception as ex3:
                    print(f"delayed Phase 3 DB error: {ex3}")
                finally:
                    db3.close()
            Thread(target=delayed_phase3).start()

    Thread(target=delayed_phase2).start()

# ─── Flask REST Route Handlers ────────────────────────────────────────────────

# ─── Auth ───
@app.route('/api/auth/user/register', methods=['POST'])
def user_register():
    """DEPRECATED: Use /api/auth/otp/register for OTP-based registration."""
    return jsonify({
        "success": False,
        "message": "Password-based registration is disabled. Please use Mobile OTP registration at /api/auth/otp/register."
    }), 410

@app.route('/api/auth/user/login', methods=['POST'])
def user_login():
    """DEPRECATED: Use /api/auth/otp/verify for OTP-based login."""
    return jsonify({
        "success": False,
        "message": "Password-based login is disabled. Please use Mobile OTP login at /api/auth/otp/verify."
    }), 410

@app.route('/api/auth/login', methods=['POST'])
def unified_login():
    """DEPRECATED: Use /api/auth/otp/verify for all portal logins."""
    return jsonify({
        "success": False,
        "message": "Password-based login is disabled. All portals now authenticate via Mobile OTP at /api/auth/otp/verify."
    }), 410

@app.route('/api/auth/hospital/register', methods=['POST'])
def hospital_register():
    """DEPRECATED: Hospitals are created by admin via /api/admin/services/register."""
    return jsonify({"success": False, "message": "Use /api/admin/services/register to create service accounts."}), 410

@app.route('/api/auth/hospital/login', methods=['POST'])
def hospital_login():
    """DEPRECATED: Use /api/auth/otp/verify with role=hospital."""
    return jsonify({"success": False, "message": "Use Mobile OTP login at /api/auth/otp/verify."}), 410

# Legacy entity auth route stubs — all disabled, redirected to OTP
def make_entity_auth_routes(model_cls, role, response_key):
    @app.route(f'/api/auth/{role}/register', methods=['POST'], endpoint=f'{role}_register')
    def register():
        return jsonify({
            "success": False,
            "message": "Self-registration is disabled. Service accounts are created by the administrator."
        }), 410

    @app.route(f'/api/auth/{role}/login', methods=['POST'], endpoint=f'{role}_login')
    def login():
        return jsonify({
            "success": False,
            "message": "Password login is disabled. Please use Mobile OTP at /api/auth/otp/verify."
        }), 410

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
    if g.entity_role in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
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
    if role in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
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
    data = request.json or {}
    device_id = data.get("device_id")
    db = get_db()
    query = db.query(Device).filter(Device.owner_id == g.user.id, Device.is_linked == True)
    if device_id:
        query = query.filter(Device.device_id == device_id)
    device = query.first()
    if not device:
        return jsonify({"success": False, "message": "Device not found or not linked to your account" if device_id else "No device linked"}), 404
        
    device.owner_id = None
    device.is_linked = False
    device.linked_at = None
    device.status = "unlinked"
    db.commit()
    return jsonify({"success": True, "message": "Device unlinked successfully"})

@app.route('/api/devices/location/update', methods=['POST'])
@authenticate_jwt
@require_user_role
def update_device_location():
    data = request.json or {}
    device_id = data.get("device_id")
    lat = data.get("latitude")
    lng = data.get("longitude")
    battery_level = data.get("battery_level")
    heading = data.get("heading", 0.0)
    accuracy = data.get("accuracy", 0.0)
    
    if not device_id:
        return jsonify({"success": False, "message": "device_id is required"}), 422
    if lat is None or lng is None:
        return jsonify({"success": False, "message": "latitude and longitude are required"}), 422
        
    db = get_db()
    
    # Verify device exists
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    # Verify authorization (owner or shared access)
    is_authorized = False
    if device.owner_id == g.user.id:
        is_authorized = True
    else:
        share = db.query(DeviceShare).filter(DeviceShare.device_id == device.id, DeviceShare.user_id == g.user.id).first()
        if share:
            is_authorized = True
            
    if not is_authorized:
        return jsonify({"success": False, "message": "Access denied for this device"}), 403
        
    # Calculate speed and update device stats
    speed = process_gps_speed_and_logs(db, device_id, lat, lng)
    check_and_update_device_stops(db, device, lat, lng, speed)
    
    # Update device's extra fields
    device.last_ping = datetime.datetime.utcnow()
    if battery_level is not None:
        try:
            device.battery_level = int(battery_level)
        except (ValueError, TypeError):
            pass
    db.add(device)
    
    # Save location record
    live_loc = LiveLocation(
        entity_id=device_id,
        entity_type='device',
        latitude=lat,
        longitude=lng,
        speed=speed,
        heading=heading,
        accuracy=accuracy
    )
    db.add(live_loc)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": "Device location updated successfully",
        "speed": speed,
        "device": device.to_json()
    })

@app.route('/api/devices/locate', methods=['GET', 'POST'])
@app.route('/api/devices/locate/', methods=['GET', 'POST'])
@authenticate_jwt
@require_user_role
def locate_device():
    device_id = None
    if request.method == 'POST':
        data = request.json or {}
        device_id = data.get("device_id") or data.get("deviceCode")
    else:
        device_id = request.args.get("device_id") or request.args.get("deviceCode")
        
    if not device_id:
        return jsonify({"success": False, "message": "device_id is required"}), 422
        
    db = get_db()
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    # Verify authorization (owner, shared access, or admin/superadmin)
    is_authorized = False
    if g.entity_role in ['admin', 'superadmin']:
        is_authorized = True
    elif device.owner_id == g.user.id:
        is_authorized = True
    else:
        share = db.query(DeviceShare).filter(DeviceShare.device_id == device.id, DeviceShare.user_id == g.user.id).first()
        if share:
            is_authorized = True
            
    if not is_authorized:
        return jsonify({"success": False, "message": "Access denied for this device"}), 403
        
    # Retrieve latest location
    loc = db.query(LiveLocation).filter(
        LiveLocation.entity_id == device.device_id,
        LiveLocation.entity_type == 'device'
    ).order_by(desc(LiveLocation.recorded_at)).first()
    
    if not loc:
        return jsonify({
            "success": True,
            "device_id": device.device_id,
            "latitude": None,
            "longitude": None,
            "speed": 0.0,
            "heading": 0.0,
            "accuracy": 0.0,
            "recorded_at": None,
            "battery_level": device.battery_level,
            "status": device.status,
            "message": "No location data available for this device"
        })
        
    return jsonify({
        "success": True,
        "device_id": device.device_id,
        "latitude": float(loc.latitude) if loc.latitude is not None else None,
        "longitude": float(loc.longitude) if loc.longitude is not None else None,
        "speed": float(loc.speed) if loc.speed is not None else 0.0,
        "heading": float(loc.heading) if loc.heading is not None else 0.0,
        "accuracy": float(loc.accuracy) if loc.accuracy is not None else 0.0,
        "recorded_at": loc.recorded_at.isoformat() if loc.recorded_at else None,
        "battery_level": device.battery_level,
        "status": device.status
    })


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
@audit_action('trigger_accident')
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
    log_accident_status(db, accident.id, 'alert_created', notes=f"Incident reported by user with severity: {severity}")
    
    # Run async background dispatch pipeline (in background thread so HTTP response is not blocked)
    Thread(target=dispatch_emergency_response_bg, args=(accident.id,)).start()
    
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

# ─── Emergency Status Workflow, Details & Reporting ───

@app.route('/api/accidents/<id>/status', methods=['POST'])
@authenticate_jwt
@audit_action('update_workflow_status')
def update_accident_status_workflow(id):
    data = request.json or {}
    new_status = data.get("status")
    notes = data.get("notes")
    
    valid_statuses = [
        'alert_created', 'alert_broadcasted', 'accepted', 'start_response',
        'en_route', 'near_incident', 'arrived', 'victim_located',
        'assistance_in_progress', 'victim_transported', 'resolved', 'closed'
    ]
    if new_status not in valid_statuses:
        return jsonify({"success": False, "message": f"Invalid status: {new_status}"}), 400
        
    db = get_db()
    accident = db.query(Accident).filter(Accident.id == id).first()
    if not accident:
        return jsonify({"success": False, "message": "Accident not found"}), 404
        
    old_status = accident.status
    accident.status = new_status
    if new_status == 'resolved':
        accident.resolved_at = datetime.datetime.utcnow()
    db.commit()
    
    log_accident_status(
        db, id, new_status,
        responder_id=g.entity_id,
        responder_type=g.entity_role,
        notes=notes or f"Manual state change from {old_status} to {new_status}."
    )
    
    if new_status in ['resolved', 'closed']:
        active_routes = db.query(Route).filter(Route.accident_id == id, Route.status == 'active').all()
        for r in active_routes:
            r.status = 'completed'
            db.commit()
            socketio.emit(f"route:{r.id}:completed", {
                "routeId": r.id,
                "accidentId": id,
                "responderId": g.entity_id,
                "responderType": g.entity_role
            })
            
    return jsonify({
        "success": True,
        "message": f"Accident status updated to {new_status}",
        "accident": accident.to_json()
    })

@app.route('/api/accidents/<id>/status-logs', methods=['GET'])
@authenticate_jwt
def get_accident_status_logs(id):
    db = get_db()
    logs = db.query(AccidentStatusLog).filter(
        AccidentStatusLog.accident_id == id
    ).order_by(AccidentStatusLog.created_at.asc()).all()
    return jsonify({
        "success": True,
        "logs": [l.to_json() for l in logs]
    })

@app.route('/api/accidents/<id>/details', methods=['GET'])
@authenticate_jwt
def get_accident_details_dashboard(id):
    db = get_db()
    accident = db.query(Accident).filter(Accident.id == id).first()
    if not accident:
        return jsonify({"success": False, "message": "Incident not found"}), 404
        
    victim = db.query(User).filter(User.id == accident.user_id).first()
    victim_json = victim.to_safe_json() if victim else None
    
    acks = db.query(Acknowledgement).filter(
        Acknowledgement.accident_id == id,
        Acknowledgement.action == 'accepted'
    ).all()
    
    responders = []
    for ack in acks:
        resp_name = "Unknown Responder"
        resp_phone = ""
        if ack.responder_type == 'volunteer':
            vol = db.query(User).filter(User.id == ack.responder_id).first()
            if vol:
                resp_name = vol.full_name
                resp_phone = vol.mobile
        elif ack.responder_type == 'policeman':
            pm = db.query(Policeman).filter(Policeman.id == ack.responder_id).first()
            if pm:
                resp_name = f"Officer {pm.name}"
                resp_phone = pm.mobile
        elif ack.responder_type == 'ambulance':
            amb = db.query(AmbulanceDriver).filter(AmbulanceDriver.id == ack.responder_id).first()
            if amb:
                resp_name = f"Ambulance Driver {amb.name} ({amb.vehicle_number})"
                resp_phone = amb.mobile
        elif ack.responder_type == 'fire_department':
            fd = db.query(User).filter(User.id == ack.responder_id).first()
            if fd:
                resp_name = fd.full_name
                resp_phone = fd.mobile
                
        active_route = db.query(Route).filter(
            Route.accident_id == id,
            Route.from_entity_id == ack.responder_id,
            Route.status == 'active'
        ).first()
        
        latest_loc = db.query(LiveLocation).filter(
            LiveLocation.entity_id == ack.responder_id,
            LiveLocation.entity_type == ack.responder_type
        ).order_by(desc(LiveLocation.recorded_at)).first()
        
        responders.append({
            "id": ack.responder_id,
            "type": ack.responder_type,
            "name": resp_name,
            "phone": resp_phone,
            "eta_minutes": active_route.eta_minutes if active_route else ack.eta_minutes,
            "distance_km": float(active_route.distance_km) if (active_route and active_route.distance_km is not None) else None,
            "route_points": active_route.route_points if active_route else None,
            "accepted_at": ack.created_at.isoformat(),
            "latest_location": latest_loc.to_json() if latest_loc else None
        })
        
    lat = float(accident.latitude)
    lng = float(accident.longitude)
    
    hospitals = db.query(Hospital).filter(Hospital.is_active == True).all()
    nearby_hospitals = find_nearby_entities(lat, lng, hospitals, 5.0)
    
    ambulances = db.query(AmbulanceDriver).filter(AmbulanceDriver.is_active == True).all()
    nearby_ambulances = find_nearby_entities(lat, lng, ambulances, 5.0)
    
    police_stations = db.query(PoliceStation).filter(PoliceStation.is_active == True).all()
    nearby_police = find_nearby_entities(lat, lng, police_stations, 5.0)
    
    fire_personnel = db.query(User).filter(User.role == 'fire_department', User.is_active == True).all()
    nearby_fire = find_nearby_entities(lat, lng, fire_personnel, 5.0)
    
    resources = {
        "hospitals": [{
            "id": h["id"],
            "name": h["name"],
            "distance_km": round(h["distance_km"], 2),
            "available_beds": h.get("available_beds", 0)
        } for h in nearby_hospitals],
        "ambulances": [{
            "id": a["id"],
            "name": a["name"],
            "distance_km": round(a["distance_km"], 2),
            "vehicle_number": a.get("vehicle_number", "")
        } for a in nearby_ambulances],
        "police_stations": [{
            "id": p["id"],
            "name": p["name"],
            "distance_km": round(p["distance_km"], 2),
            "address": p.get("address", "")
        } for p in nearby_police],
        "fire_departments": [{
            "id": f["id"],
            "name": f["full_name"],
            "distance_km": round(f["distance_km"], 2)
        } for f in nearby_fire]
    }
    
    logs = db.query(AccidentStatusLog).filter(
        AccidentStatusLog.accident_id == id
    ).order_by(AccidentStatusLog.created_at.asc()).all()
    
    report = db.query(AccidentReport).filter(AccidentReport.accident_id == id).first()
    
    return jsonify({
        "success": True,
        "accident": accident.to_json(),
        "victim": victim_json,
        "responders": responders,
        "resources": resources,
        "timeline": [l.to_json() for l in logs],
        "report": report.to_json() if report else None
    })

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/api/accidents/<id>/upload-evidence', methods=['POST'])
@authenticate_jwt
def upload_accident_evidence(id):
    if 'file' not in request.files:
        return jsonify({"success": False, "message": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "message": "No selected file"}), 400
        
    from werkzeug.utils import secure_filename
    filename = secure_filename(f"{id}_{uuid.uuid4().hex[:8]}_{file.filename}")
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)
    
    file_url = f"/api/uploads/{filename}"
    return jsonify({"success": True, "url": file_url})

@app.route('/api/uploads/<filename>', methods=['GET'])
def get_uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/api/accidents/<id>/report', methods=['POST'])
@authenticate_jwt
@audit_action('submit_field_report')
def submit_accident_report(id):
    data = request.json or {}
    field_report = data.get("field_report")
    victim_status = data.get("victim_status")
    severity = data.get("severity")
    evidence_urls = data.get("evidence_urls", [])
    actions_taken = data.get("actions_taken")
    additional_support = data.get("additional_support_requested")
    
    db = get_db()
    accident = db.query(Accident).filter(Accident.id == id).first()
    if not accident:
        return jsonify({"success": False, "message": "Accident not found"}), 404
        
    report = db.query(AccidentReport).filter(
        AccidentReport.accident_id == id,
        AccidentReport.responder_id == g.entity_id
    ).first()
    
    if not report:
        report = AccidentReport(
            accident_id=id,
            responder_id=g.entity_id,
            responder_type=g.entity_role
        )
        db.add(report)
        
    if field_report is not None: report.field_report = field_report
    if victim_status is not None: report.victim_status = victim_status
    if severity is not None:
        report.severity = severity
        accident.severity = severity
    if evidence_urls is not None: report.evidence_urls = evidence_urls
    if actions_taken is not None: report.actions_taken = actions_taken
    if additional_support is not None: report.additional_support_requested = additional_support
    
    status_mapping = {
        'located': 'victim_located',
        'stabilizing': 'assistance_in_progress',
        'treatment': 'assistance_in_progress',
        'transporting': 'victim_transported',
        'resolved': 'resolved',
        'closed': 'closed'
    }
    
    if victim_status in status_mapping:
        mapped_status = status_mapping[victim_status]
        accident.status = mapped_status
        log_accident_status(
            db, id, mapped_status,
            responder_id=g.entity_id,
            responder_type=g.entity_role,
            notes=f"Victim status updated to {victim_status}. Field notes: {field_report or ''}"
        )
        
        if mapped_status in ['resolved', 'closed']:
            active_routes = db.query(Route).filter(Route.accident_id == id, Route.status == 'active').all()
            for r in active_routes:
                r.status = 'completed'
                db.commit()
                socketio.emit(f"route:{r.id}:completed", {
                    "routeId": r.id,
                    "accidentId": id,
                    "responderId": g.entity_id,
                    "responderType": g.entity_role
                })
                
    db.commit()
    return jsonify({
        "success": True,
        "message": "Field report submitted successfully",
        "report": report.to_json()
    })

# ─── Incident Chat Operations ───

@app.route('/api/accidents/<id>/chat', methods=['GET'])
@authenticate_jwt
def get_incident_chat(id):
    db = get_db()
    messages = db.query(IncidentMessage).filter(IncidentMessage.accident_id == id).order_by(IncidentMessage.created_at.asc()).all()
    return jsonify({
        "success": True,
        "messages": [m.to_json() for m in messages]
    })

@app.route('/api/accidents/<id>/chat', methods=['POST'])
@authenticate_jwt
@audit_action('send_chat_message')
def send_incident_chat(id):
    data = request.json or {}
    message_type = data.get("messageType", "text")
    content = data.get("content")
    
    if not content:
        return jsonify({"success": False, "message": "Content is required"}), 400
        
    db = get_db()
    
    sender_name = "Responder"
    if g.entity_role in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
        usr = db.query(User).filter(User.id == g.entity_id).first()
        if usr: sender_name = usr.full_name
    elif g.entity_role == 'policeman':
        pm = db.query(Policeman).filter(Policeman.id == g.entity_id).first()
        if pm: sender_name = f"Officer {pm.name}"
    elif g.entity_role == 'ambulance':
        amb = db.query(AmbulanceDriver).filter(AmbulanceDriver.id == g.entity_id).first()
        if amb: sender_name = f"Ambulance {amb.name}"
    elif g.entity_role == 'hospital':
        hosp = db.query(Hospital).filter(Hospital.id == g.entity_id).first()
        if hosp: sender_name = hosp.name
    elif g.entity_role in ('admin', 'superadmin'):
        sender_name = "Control Room Admin"

    msg = IncidentMessage(
        accident_id=id,
        sender_id=g.entity_id,
        sender_type=g.entity_role,
        sender_name=sender_name,
        message_type=message_type,
        content=content
    )
    db.add(msg)
    db.commit()
    
    socketio.emit(f"accident:{id}:chat", msg.to_json(), room=f"accident:{id}")
    
    return jsonify({
        "success": True,
        "message": msg.to_json()
    })

# ─── Smart Assignment recommendation engine ───

@app.route('/api/accidents/<id>/recommend-responders', methods=['GET'])
@authenticate_jwt
def recommend_responders(id):
    db = get_db()
    accident = db.query(Accident).filter(Accident.id == id).first()
    if not accident:
        return jsonify({"success": False, "message": "Accident not found"}), 404
        
    acc_lat = float(accident.latitude)
    acc_lng = float(accident.longitude)
    severity = accident.severity or 'medium'
    
    recommendations = []
    
    def score_responder(entity_id, entity_role, entity_name, entity_mobile, e_lat, e_lng):
        dist = haversine_distance(acc_lat, acc_lng, e_lat, e_lng)
        if dist > 15.0:
            return None
            
        distance_score = max(0, 100 - int(round(dist * 6)))
        
        suitability_bonus = 0
        if severity in ('critical', 'high'):
            if entity_role == 'ambulance': suitability_bonus = 80
            elif entity_role == 'policeman': suitability_bonus = 50
            elif entity_role == 'volunteer': suitability_bonus = 20
            elif entity_role == 'fire_department': suitability_bonus = 60
        else:
            if entity_role == 'volunteer': suitability_bonus = 80
            elif entity_role == 'policeman': suitability_bonus = 50
            elif entity_role == 'mechanic': suitability_bonus = 40
            
        active_routes_count = db.query(Route).filter(
            Route.from_entity_id == entity_id,
            Route.status == 'active'
        ).count()
        
        workload_bonus = 30 if active_routes_count == 0 else -40
        
        total_score = distance_score + suitability_bonus + workload_bonus
        return {
            "id": entity_id,
            "role": entity_role,
            "name": entity_name,
            "mobile": entity_mobile,
            "distance_km": round(dist, 2),
            "score": total_score,
            "eta_minutes": estimate_eta(dist, 40)
        }
        
    ambs = db.query(AmbulanceDriver).filter(AmbulanceDriver.is_active == True, AmbulanceDriver.is_available == True).all()
    for a in ambs:
        if a.latitude is not None and a.longitude is not None:
            score = score_responder(a.id, 'ambulance', a.name, a.mobile, float(a.latitude), float(a.longitude))
            if score: recommendations.append(score)
            
    pms = db.query(Policeman).filter(Policeman.is_active == True, Policeman.is_available == True).all()
    for p in pms:
        if p.latitude is not None and p.longitude is not None:
            score = score_responder(p.id, 'policeman', p.name, p.mobile, float(p.latitude), float(p.longitude))
            if score: recommendations.append(score)
            
    users = db.query(User).filter(User.is_active == True, User.is_available == True, User.role.in_(['volunteer', 'fire_department'])).all()
    for u in users:
        if u.last_location_lat is not None and u.last_location_lng is not None:
            score = score_responder(u.id, u.role, u.full_name, u.mobile, float(u.last_location_lat), float(u.last_location_lng))
            if score: recommendations.append(score)
            
    recommendations.sort(key=lambda r: r["score"], reverse=True)
    return jsonify({
        "success": True,
        "recommendations": recommendations[:5]
    })

@app.route('/api/accidents/<id>/assign', methods=['POST'])
@authenticate_jwt
@audit_action('assign_responder')
def assign_responder(id):
    data = request.json or {}
    responder_id = data.get("responderId")
    responder_type = data.get("responderType")
    
    if not responder_id or not responder_type:
        return jsonify({"success": False, "message": "responderId and responderType are required"}), 400
        
    db = get_db()
    accident = db.query(Accident).filter(Accident.id == id).first()
    if not accident:
        return jsonify({"success": False, "message": "Accident not found"}), 404
        
    # Check if there is an existing active alert for this responder on this accident
    existing_alert = db.query(Alert).filter(
        Alert.accident_id == id,
        Alert.recipient_id == responder_id,
        Alert.recipient_type == responder_type
    ).first()
    
    if existing_alert:
        return jsonify({"success": True, "message": "Responder has already been dispatched/notified", "alert": existing_alert.to_json()})
        
    res_lat = None
    res_lng = None
    recipient_mobile = ""
    recipient_name = "Responder"
    entity = None
    
    if responder_type in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
        entity = db.query(User).filter(User.id == responder_id).first()
        if entity:
            res_lat = entity.latitude
            res_lng = entity.longitude
            recipient_mobile = entity.mobile
            recipient_name = entity.full_name
    elif responder_type == 'hospital':
        entity = db.query(Hospital).filter(Hospital.id == responder_id).first()
        if entity:
            res_lat = entity.latitude
            res_lng = entity.longitude
            recipient_mobile = entity.mobile
            recipient_name = entity.name
    elif responder_type == 'ambulance':
        entity = db.query(AmbulanceDriver).filter(AmbulanceDriver.id == responder_id).first()
        if entity:
            res_lat = entity.latitude
            res_lng = entity.longitude
            recipient_mobile = entity.mobile
            recipient_name = entity.name
    elif responder_type == 'policeman':
        entity = db.query(Policeman).filter(Policeman.id == responder_id).first()
        if entity:
            res_lat = entity.latitude
            res_lng = entity.longitude
            recipient_mobile = entity.mobile
            recipient_name = entity.name
            
    dist_km = 0.0
    if res_lat is not None and res_lng is not None:
        dist_km = haversine_distance(float(accident.latitude), float(accident.longitude), float(res_lat), float(res_lng))
        
    eta_min = estimate_eta(dist_km, 40)
    
    alert = Alert(
        accident_id=accident.id,
        recipient_id=responder_id,
        recipient_type=responder_type,
        message=f"🚨 ASSIGNED BY CONTROL ROOM: Emergency call {accident.accident_code}. Distance: {round(dist_km, 2)}km | ETA: {eta_min}min. Please accept immediately.",
        phase=1,
        distance_km=dist_km,
        eta_minutes=eta_min,
        status='sent'
    )
    db.add(alert)
    db.flush()
    
    user = db.query(User).filter(User.id == accident.user_id).first()
    user_json = user.to_safe_json() if user else None
    
    socket_payload = {
        "type": "accident_alert",
        "alert": alert.to_json(),
        "accident": accident.to_json(),
        "user": user_json,
        "victim": user_json
    }
    socketio.emit(f"entity:{responder_id}:alert", socket_payload, to=f"entity:{responder_id}")
    socketio.emit("alert:new", {"alert": alert.to_json(), "accident": accident.to_json()}, to=f"entity:{responder_id}")
    
    fcm_token = getattr(entity, 'fcm_token', None)
    if fcm_token:
        send_push_notification(fcm_token, "🚨 EMERGENCY DISPATCH ASSIGNMENT", alert.message, {"accidentId": accident.id})
        
    db.commit()
    return jsonify({"success": True, "message": "Responder successfully dispatched", "alert": alert.to_json()})


# ─── Emergency Resource Management ───

@app.route('/api/admin/resources', methods=['GET'])
@authenticate_jwt
@require_admin_role
def get_emergency_resources():
    db = get_db()
    resources = db.query(EmergencyResource).all()
    return jsonify({
        "success": True,
        "resources": [r.to_json() for r in resources]
    })

@app.route('/api/admin/resources', methods=['POST'])
@authenticate_jwt
@require_admin_role
@audit_action('add_emergency_resource')
def create_emergency_resource():
    data = request.json or {}
    name = data.get("name")
    rtype = data.get("type")
    vehicle_number = data.get("vehicle_number")
    lat = data.get("latitude")
    lng = data.get("longitude")
    
    if not name or not rtype or not vehicle_number:
        return jsonify({"success": False, "message": "name, type, and vehicle_number are required"}), 400
        
    db = get_db()
    resource = EmergencyResource(
        name=name,
        type=rtype,
        vehicle_number=vehicle_number,
        latitude=lat,
        longitude=lng,
        status='available'
    )
    db.add(resource)
    db.commit()
    
    return jsonify({
        "success": True,
        "resource": resource.to_json()
    })

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
    
    # Calculate GPS speed automatically for user device
    if entity_type == 'user':
        speed = process_gps_speed_and_logs(db, g.entity_id, lat, lng)
        
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
    
    if g.entity_role in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
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
    
    # Police Stealth Mode filtering: only admin can see stealth mode officers
    if g.entity_role != 'admin':
        police = [p for p in police if getattr(p, 'status', 'available') != 'stealth']
        
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
@app.route('/api/fire/alerts', methods=['GET'])
@app.route('/api/volunteer/alerts', methods=['GET'])
@app.route('/api/my/alerts', methods=['GET'])
@authenticate_jwt
def my_alerts():
    db = get_db()
    # Map login role to the recipient_type stored in alerts
    role_to_recipient = {
        'hospital': 'hospital',
        'ambulance': 'ambulance',
        'police_station': 'police_station',
        'policeman': 'policeman',
        'mechanic': 'mechanic',
        'insurance': 'insurance',
        'user': 'user',
        'volunteer': 'volunteer',
        'fire_department': 'fire_department',
        'emergency_personnel': 'emergency_personnel',
    }
    recipient_type = role_to_recipient.get(g.entity_role, g.entity_role)
    alerts = db.query(Alert).filter(
        Alert.recipient_id == g.entity_id,
        Alert.recipient_type == recipient_type,
        Alert.status != 'superseded'  # exclude stale alerts from replaced accidents
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
            "user": user.to_safe_json() if user else None,
            "victim": user.to_safe_json() if user else None
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
@app.route('/api/fire/alerts/<id>/respond', methods=['POST'])
@app.route('/api/volunteer/alerts/<id>/respond', methods=['POST'])
@authenticate_jwt
@audit_action('respond_alert')
def respond_alert(id):
    data = request.json or {}
    action = data.get("action")
    eta = data.get("eta")
    
    db = get_db()
    alert = db.query(Alert).filter(Alert.id == id).first()
    if not alert:
        return jsonify({"success": False, "message": "Alert not found"}), 404
        
    if action == 'accepted':
        # Check duplicate assignment lock
        existing_ack = db.query(Acknowledgement).filter(
            Acknowledgement.accident_id == alert.accident_id,
            Acknowledgement.action == 'accepted',
            Acknowledgement.responder_type == g.entity_role
        ).first()
        
        if existing_ack and not data.get("escalation"):
            return jsonify({
                "success": False,
                "message": "This alert has already been accepted by another responder from your department."
            }), 409
            
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
            "entityId": g.entity_id,
            "entityType": g.entity_role,
            "responderType": g.entity_role,
            "type": g.entity_role,
            "eta": eta,
            "action": "accepted",
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        socketio.emit(f"accident:{alert.accident_id}:responded", payload)
        socketio.emit("accident:responded", payload)
        
    db.commit()
    
    if action == 'accepted':
        log_accident_status(db, alert.accident_id, 'accepted', responder_id=g.entity_id, responder_type=g.entity_role, notes=f"Incident accepted. Responder ETA: {eta} minutes.")
        
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
    if role in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
        entity = db.query(User).filter(User.id == g.entity_id).first()
    elif role == 'hospital':
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
        
    status = data.get("status")
    if is_available is not None:
        entity.is_available = str(is_available).lower() == "true" if isinstance(is_available, str) else bool(is_available)
    if is_active is not None:
        entity.is_active = str(is_active).lower() == "true" if isinstance(is_active, str) else bool(is_active)
        
    if role == 'policeman' and status is not None:
        if status in ['available', 'unavailable', 'stealth']:
            entity.status = status
            entity.is_available = (status in ['available', 'stealth']) # still available for alerts in stealth
            
    db.add(entity)
    db.commit()
    
    # Return updated entity json
    profile_data = entity.to_safe_json() if hasattr(entity, 'to_safe_json') else entity.to_json()
    return jsonify({"success": True, "profile": profile_data})

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
        Alert.recipient_type == 'insurance',
        Alert.status != 'superseded'  # exclude stale alerts
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
    
    total_resolved = 0
    sla_compliant_count = 0
    total_response_minutes = 0
    
    dept_metrics = {
        'volunteer': {"count": 0, "total_mins": 0},
        'policeman': {"count": 0, "total_mins": 0},
        'ambulance': {"count": 0, "total_mins": 0},
        'fire_department': {"count": 0, "total_mins": 0}
    }
    
    hotspots = {}
    
    for accident in accidents:
        status = accident.status or "unknown"
        severity = accident.severity or "unknown"
        by_status[status] = by_status.get(status, 0) + 1
        by_severity[severity] = by_severity.get(severity, 0) + 1
        
        # Cluster hotspots
        try:
            lat_rounded = round(float(accident.latitude), 2)
            lng_rounded = round(float(accident.longitude), 2)
            key = f"{lat_rounded}, {lng_rounded}"
            hotspots[key] = hotspots.get(key, 0) + 1
        except Exception:
            pass
        
        if status in ('resolved', 'closed') and accident.resolved_at and accident.created_at:
            diff_mins = (accident.resolved_at - accident.created_at).total_seconds() / 60.0
            total_resolved += 1
            total_response_minutes += diff_mins
            if diff_mins <= 15.0:
                sla_compliant_count += 1
                
            resp_type = accident.responder_type
            if resp_type in dept_metrics:
                dept_metrics[resp_type]["count"] += 1
                dept_metrics[resp_type]["total_mins"] += diff_mins
                
    hotspots_list = [
        {"coordinates": key, "count": count} 
        for key, count in sorted(hotspots.items(), key=lambda x: x[1], reverse=True)[:5]
    ]
    
    avg_response = round(total_response_minutes / total_resolved, 1) if total_resolved > 0 else 12.5
    sla_rate = round((sla_compliant_count / total_resolved) * 100, 1) if total_resolved > 0 else 88.0
    
    dept_performance = []
    for dept, data in dept_metrics.items():
        avg = round(data["total_mins"] / data["count"], 1) if data["count"] > 0 else (10.0 if dept == 'ambulance' else 14.0)
        dept_performance.append({
            "department": dept.replace('_', ' ').capitalize(),
            "resolvedCount": data["count"],
            "avgResponseMins": avg
        })
        
    severity_order = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    return {
        "byStatus": [
            {"status": status, "count": count}
            for status, count in sorted(by_status.items())
        ],
        "bySeverity": [
            {"severity": severity, "count": count}
            for severity, count in sorted(by_severity.items(), key=lambda item: severity_order.get(item[0], 99))
        ],
        "averageResponseMins": avg_response,
        "slaComplianceRate": sla_rate,
        "departmentPerformance": dept_performance,
        "hotspots": hotspots_list,
        "volunteerPerformance": {
            "resolvedCount": dept_metrics["volunteer"]["count"],
            "avgResponseMins": round(dept_metrics["volunteer"]["total_mins"] / dept_metrics["volunteer"]["count"], 1) if dept_metrics["volunteer"]["count"] > 0 else 13.2,
            "rating": 4.8
        }
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

# ─── Super Admin Admin-Management routes ───
@app.route('/api/admin/manage/admins', methods=['GET'])
@authenticate_jwt
@require_superadmin_role
def admin_manage_list_admins():
    db = get_db()
    admins = db.query(User).filter(User.role.in_(['admin', 'superadmin'])).order_by(desc(User.created_at)).all()
    results = [a.to_safe_json() for a in admins]
    results.append({
        "id": "admin-001",
        "unique_id": "AB000001",
        "full_name": "System Administrator",
        "email": os.getenv("ADMIN_EMAIL", "admin@aapadbandhav.in"),
        "mobile": os.getenv("ADMIN_MOBILE", "9999999999"),
        "role": "superadmin",
        "is_active": True,
        "mobile_verified": True,
        "permissions": ["manage_users", "manage_devices", "manage_vehicles", "manage_police", "manage_reports", "manage_documentation"],
        "created_by": "system"
    })
    return jsonify({"success": True, "admins": results})

@app.route('/api/admin/manage/admins', methods=['POST'])
@authenticate_jwt
@require_superadmin_role
def admin_manage_create_admin():
    data = request.json or {}
    name = data.get("name")
    mobile = data.get("mobile")
    email = data.get("email")
    role = data.get("role", "admin")
    permissions = data.get("permissions", [])

    if not name or not mobile:
        return jsonify({"success": False, "message": "name and mobile are required"}), 422

    if role not in ('admin', 'superadmin'):
        return jsonify({"success": False, "message": "Role must be 'admin' or 'superadmin'"}), 422

    db = get_db()

    from src.services.services import find_entity_by_mobile
    existing_entity, existing_role = find_entity_by_mobile(db, mobile)
    if existing_entity:
        return jsonify({"success": False, "message": f"Mobile number already registered as {existing_role}"}), 409

    unique_id = ""
    while True:
        rest = "".join([str(random.randint(0, 9)) for _ in range(6)])
        unique_id = "AB" + rest
        if not db.query(User).filter(User.unique_id == unique_id).first():
            break

    user = User(
        unique_id=unique_id,
        full_name=name,
        email=email,
        mobile=mobile,
        password=None,
        role=role,
        is_active=True,
        mobile_verified=False,
        permissions=permissions,
        created_by=g.user.id if hasattr(g, 'user') else 'admin-001'
    )
    db.add(user)
    db.commit()

    from src.repositories.repos import AuditLogRepository
    audit_repo = AuditLogRepository(db)
    audit_repo.log('superadmin', g.user.id if hasattr(g, 'user') else 'admin-001', 'create_admin', f"Created admin {name} ({mobile}) with permissions {permissions}")

    role_label = role.replace('_', ' ').title()
    welcome_msg = (
        f"AapadBandhav\n\n"
        f"Welcome to AapadBandhav!\n\n"
        f"You have been registered as an {role_label}.\n"
        f"Permissions: {', '.join(permissions) if permissions else 'None'}\n"
        f"Please install the AapadBandhav app and sign in with your mobile number using OTP verification.\n\n"
        f"Thank You,\n"
        f"Team NighaTech Global Pvt Ltd"
    )
    Thread(target=send_sms, args=(mobile, welcome_msg)).start()

    return jsonify({"success": True, "message": f"{role_label} account created successfully.", "admin": user.to_safe_json()}), 201

@app.route('/api/admin/manage/admins/<id>', methods=['PUT'])
@authenticate_jwt
@require_superadmin_role
def admin_manage_edit_admin(id):
    if id == "admin-001":
        return jsonify({"success": False, "message": "Cannot modify synthetic system administrator"}), 400

    data = request.json or {}
    name = data.get("name")
    email = data.get("email")
    role = data.get("role")
    permissions = data.get("permissions")

    db = get_db()
    user = db.query(User).filter(User.id == id, User.role.in_(['admin', 'superadmin'])).first()
    if not user:
        return jsonify({"success": False, "message": "Admin account not found"}), 404

    if name: user.full_name = name
    if email is not None: user.email = email
    if role:
        if role not in ('admin', 'superadmin'):
            return jsonify({"success": False, "message": "Role must be 'admin' or 'superadmin'"}), 422
        user.role = role
    if permissions is not None: user.permissions = permissions

    db.add(user)
    db.commit()

    from src.repositories.repos import AuditLogRepository
    audit_repo = AuditLogRepository(db)
    audit_repo.log('superadmin', g.user.id if hasattr(g, 'user') else 'admin-001', 'update_admin', f"Updated admin {user.full_name} ({user.mobile}) with permissions {permissions}")

    return jsonify({"success": True, "message": "Admin account updated successfully", "admin": user.to_safe_json()})

@app.route('/api/admin/manage/admins/<id>/toggle', methods=['PUT'])
@authenticate_jwt
@require_superadmin_role
def admin_manage_toggle_admin(id):
    if id == "admin-001":
        return jsonify({"success": False, "message": "Cannot modify synthetic system administrator"}), 400

    db = get_db()
    user = db.query(User).filter(User.id == id, User.role.in_(['admin', 'superadmin'])).first()
    if not user:
        return jsonify({"success": False, "message": "Admin account not found"}), 404

    user.is_active = not bool(user.is_active)
    db.add(user)
    db.commit()

    from src.repositories.repos import AuditLogRepository
    audit_repo = AuditLogRepository(db)
    status_label = "activated" if user.is_active else "suspended"
    audit_repo.log('superadmin', g.user.id if hasattr(g, 'user') else 'admin-001', 'toggle_admin_status', f"{status_label.capitalize()} admin {user.full_name} ({user.mobile})")

    return jsonify({"success": True, "message": f"Admin account has been {status_label}", "admin": user.to_safe_json()})

@app.route('/api/admin/manage/admins/<id>', methods=['DELETE'])
@authenticate_jwt
@require_superadmin_role
def admin_manage_delete_admin(id):
    if id == "admin-001":
        return jsonify({"success": False, "message": "Cannot delete synthetic system administrator"}), 400

    db = get_db()
    user = db.query(User).filter(User.id == id, User.role.in_(['admin', 'superadmin'])).first()
    if not user:
        return jsonify({"success": False, "message": "Admin account not found"}), 404

    admin_name = user.full_name
    admin_mobile = user.mobile
    db.delete(user)
    db.commit()

    from src.repositories.repos import AuditLogRepository
    audit_repo = AuditLogRepository(db)
    audit_repo.log('superadmin', g.user.id if hasattr(g, 'user') else 'admin-001', 'delete_admin', f"Deleted admin {admin_name} ({admin_mobile})")

    return jsonify({"success": True, "message": "Admin account deleted successfully"})

@app.route('/api/admin/manage/logs', methods=['GET'])
@authenticate_jwt
@require_superadmin_role
def admin_manage_get_logs():
    db = get_db()
    from src.models.models import AuditLog
    logs = db.query(AuditLog).order_by(desc(AuditLog.created_at)).limit(200).all()
    return jsonify({"success": True, "logs": [l.to_json() for l in logs]})


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
    # Roles stored in their own dedicated tables
    configs = [
        ("user", User, "full_name"),
        ("hospital", Hospital, "name"),
        ("ambulance", AmbulanceDriver, "name"),
        ("police_station", PoliceStation, "name"),
        ("policeman", Policeman, "name"),
        ("mechanic", Mechanic, "name"),
        ("insurance", InsuranceCompany, "name"),
    ]
    # Roles stored in the User table with a `role` field (volunteer, fire_department, etc.)
    USER_TABLE_ROLES = ["volunteer", "fire_department", "emergency_personnel"]
    rows = []
    for role, model_cls, name_field in configs:
        # Skip roles that are stored in User table — handled separately below
        if role == "user" and role_filter in USER_TABLE_ROLES:
            continue
        if role_filter != "all" and role_filter != role:
            continue
        # For the "user" role, only return rows whose role is "user" (not volunteer/fire_dept)
        if role == "user" and role_filter in ("all", "user"):
            query = db.query(User).filter(~User.role.in_(USER_TABLE_ROLES))
        else:
            query = db.query(model_cls)
        for entity in query.all():
            data = entity.to_safe_json()
            rows.append({
                **data,
                "entityType": role,
                "display_name": data.get(name_field) or data.get("name") or data.get("full_name") or data.get("email"),
                "unique_id": data.get("unique_id") or data.get("station_code") or data.get("badge_number") or data.get("license_number") or data.get("id"),
            })
    # Handle User-table-backed roles (volunteer, fire_department, emergency_personnel)
    if role_filter == "all" or role_filter in USER_TABLE_ROLES:
        role_values = USER_TABLE_ROLES if role_filter == "all" else [role_filter]
        for entity in db.query(User).filter(User.role.in_(role_values)).all():
            data = entity.to_safe_json()
            rows.append({
                **data,
                "entityType": entity.role,
                "display_name": data.get("full_name") or data.get("name") or data.get("email"),
                "unique_id": data.get("unique_id") or data.get("id"),
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
    """
    Admin creates a service account using mobile number as primary identifier.
    No password is required — service accounts authenticate via Mobile + OTP.
    """
    data = request.json or {}
    role = data.get("role")
    name = data.get("name")
    mobile = data.get("mobile")
    email = data.get("email")  # Optional

    if not role or not name or not mobile:
        return jsonify({"success": False, "message": "role, name, and mobile are required"}), 422

    if len(str(mobile).strip()) < 10:
        return jsonify({"success": False, "message": "A valid 10-digit mobile number is required"}), 422

    db = get_db()

    # Check for mobile uniqueness across all entity tables
    from src.services.services import find_entity_by_mobile
    existing_entity, existing_role = find_entity_by_mobile(db, mobile)
    if existing_entity:
        return jsonify({"success": False, "message": f"Mobile number already registered as {existing_role}"}), 409

    service_configs = {
        "hospital": (Hospital, "hospital", {
            "name": name,
            "email": email,
            "mobile": mobile,
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "specializations": data.get("specializations", []),
            "bed_capacity": int(data.get("bed_capacity") or 0),
            "available_beds": int(data.get("available_beds") or data.get("bed_capacity") or 0),
            "registration_number": data.get("registration_number"),
            "city": data.get("city"),
            "state": data.get("state"),
            "is_active": True,
            "is_available": True,
            "mobile_verified": False,
        }),
        "ambulance": (AmbulanceDriver, "driver", {
            "name": name,
            "email": email,
            "mobile": mobile,
            "license_number": data.get("license_number"),
            "vehicle_number": data.get("vehicle_number"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "is_active": True,
            "is_available": True,
            "mobile_verified": False,
            "last_seen": datetime.datetime.utcnow()
        }),
        "police_station": (PoliceStation, "station", {
            "name": name,
            "email": email,
            "mobile": mobile,
            "station_code": data.get("station_code"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "address": data.get("address"),
            "city": data.get("city"),
            "state": data.get("state"),
            "is_active": True,
            "is_available": True,
            "mobile_verified": False,
        }),
        "policeman": (Policeman, "policeman", {
            "name": name,
            "email": email,
            "mobile": mobile,
            "badge_number": data.get("badge_number"),
            "station_id": data.get("station_id"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "is_active": True,
            "is_available": True,
            "mobile_verified": False,
            "last_seen": datetime.datetime.utcnow()
        }),
        "mechanic": (Mechanic, "mechanic", {
            "name": name,
            "email": email,
            "mobile": mobile,
            "specialization": data.get("specialization"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "is_active": True,
            "is_available": True,
            "mobile_verified": False,
            "rating": 4.0,
            "last_seen": datetime.datetime.utcnow()
        }),
        "insurance": (InsuranceCompany, "company", {
            "name": name,
            "email": email,
            "mobile": mobile,
            "license_number": data.get("license_number"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "address": data.get("address"),
            "city": data.get("city"),
            "is_active": True,
            "mobile_verified": False,
        }),
    }

    config = service_configs.get(role)
    if not config:
        return jsonify({"success": False, "message": "Invalid service role"}), 422

    model_cls, response_key, fields = config
    if role in ["hospital", "police_station", "insurance"] and (fields.get("latitude") is None or fields.get("longitude") is None):
        return jsonify({"success": False, "message": f"{role.replace('_', ' ').title()} latitude and longitude are required"}), 422

    # Remove fields not applicable to the model (e.g., mobile_verified may not exist on older schemas)
    cleaned = {k: v for k, v in fields.items() if hasattr(model_cls, k)}

    entity = model_cls(**cleaned)
    db.add(entity)
    db.commit()

    # Send a welcome SMS to inform the new account holder
    role_label = role.replace('_', ' ').title()
    welcome_msg = (
        f"AapadBandhav\n\n"
        f"Welcome to AapadBandhav!\n\n"
        f"You have been registered as a {role_label}.\n"
        f"Please install the AapadBandhav app and sign in with your mobile number using OTP verification.\n\n"
        f"Thank You,\n"
        f"Team NighaTech Global Pvt Ltd"
    )
    Thread(target=send_sms, args=(mobile, welcome_msg)).start()

    return jsonify({
        "success": True,
        "message": f"{role_label} account created. A welcome SMS has been sent to {mobile}.",
        response_key: entity.to_safe_json()
    }), 201

@app.route('/api/admin/users/create', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_create_user_account():
    """
    Admin creates a citizen-type personnel account (volunteer, fire_department, emergency_personnel).
    These are stored in the users table with their appropriate role value.
    No password required — all authenticate via Mobile + OTP.
    """
    data = request.json or {}
    role = data.get("role")
    name = data.get("name")
    mobile = data.get("mobile")

    ALLOWED_ROLES = {'volunteer', 'fire_department', 'emergency_personnel'}
    if not role or role not in ALLOWED_ROLES:
        return jsonify({"success": False, "message": f"Role must be one of: {', '.join(ALLOWED_ROLES)}"}), 422
    if not name or not mobile:
        return jsonify({"success": False, "message": "name and mobile are required"}), 422
    if len(str(mobile).strip()) < 10:
        return jsonify({"success": False, "message": "A valid 10-digit mobile number is required"}), 422

    db = get_db()

    from src.services.services import find_entity_by_mobile
    existing_entity, existing_role = find_entity_by_mobile(db, mobile)
    if existing_entity:
        return jsonify({"success": False, "message": f"Mobile number already registered as {existing_role}"}), 409

    unique_id = ""
    while True:
        rest = "".join([str(random.randint(0, 9)) for _ in range(6)])
        unique_id = "AB" + rest
        if not db.query(User).filter(User.unique_id == unique_id).first():
            break

    user = User(
        unique_id=unique_id,
        full_name=name,
        email=data.get("email"),
        mobile=mobile,
        password=None,
        address=data.get("address"),
        role=role,
        department=data.get("department"),
        rank=data.get("rank"),
        is_active=True,
        mobile_verified=False,  # Must verify on first OTP login
    )
    db.add(user)
    db.commit()

    role_label = role.replace('_', ' ').title()
    welcome_msg = (
        f"AapadBandhav\n\n"
        f"Welcome to AapadBandhav!\n\n"
        f"You have been registered as a {role_label}.\n"
        f"Please install the AapadBandhav app and sign in with your mobile number using OTP verification.\n\n"
        f"Thank You,\n"
        f"Team NighaTech Global Pvt Ltd"
    )
    Thread(target=send_sms, args=(mobile, welcome_msg)).start()

    return jsonify({
        "success": True,
        "message": f"{role_label} account created. A welcome SMS has been sent to {mobile}.",
        "user": user.to_safe_json()
    }), 201

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

# ─── Health Checks ───
@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health_check():
    db_ok = True
    try:
        if DB_DIALECT == 'mongodb':
            mongo_db.command('ping')
        else:
            db = SessionLocal()
            try:
                from sqlalchemy import text
                db.execute(text("SELECT 1"))
            finally:
                db.close()
    except Exception as e:
        print(f"Health check DB error: {e}")
        db_ok = False

    mqtt_ok = False
    try:
        if mqtt_client and mqtt_client.is_connected():
            mqtt_ok = True
    except Exception as e:
        print(f"Health check MQTT error: {e}")

    redis_ok = True
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        try:
            import redis
            r = redis.Redis.from_url(redis_url)
            r.ping()
        except Exception as e:
            print(f"Health check Redis error: {e}")
            redis_ok = False

    status = "healthy"
    if not db_ok or not mqtt_ok or not redis_ok:
        status = "degraded"

    return jsonify({
        "success": True,
        "status": status,
        "app": "AapadBandhav",
        "version": "1.0.0",
        "environment": os.getenv("NODE_ENV", "development"),
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "services": {
            "database": "online" if db_ok else "offline",
            "mqtt": "online" if mqtt_ok else "offline",
            "redis": "online" if redis_ok else "offline"
        },
        "checks": {
            "database": "ok" if db_ok else "error",
            "mqtt": "ok" if mqtt_ok else "error",
            "redis": "ok" if redis_ok else "error"
        }
    }), 200 if db_ok else 503

@app.route('/health/db', methods=['GET'])
@app.route('/api/health/db', methods=['GET'])
def health_db():
    db_ok = True
    error_msg = None
    try:
        if DB_DIALECT == 'mongodb':
            mongo_db.command('ping')
        else:
            db = SessionLocal()
            try:
                db.execute("SELECT 1")
            finally:
                db.close()
    except Exception as e:
        db_ok = False
        error_msg = str(e)

    if db_ok:
        return jsonify({"status": "ok", "message": "Database is responsive"}), 200
    else:
        return jsonify({"status": "error", "message": error_msg}), 503

@app.route('/health/mqtt', methods=['GET'])
@app.route('/api/health/mqtt', methods=['GET'])
def health_mqtt():
    if mqtt_client and mqtt_client.is_connected():
        return jsonify({"status": "ok", "message": "MQTT broker connection is active"}), 200
    else:
        return jsonify({"status": "error", "message": "MQTT connection is inactive"}), 503

@app.route('/health/redis', methods=['GET'])
@app.route('/api/health/redis', methods=['GET'])
def health_redis():
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return jsonify({"status": "ok", "message": "Redis is not configured in this environment"}), 200
    try:
        import redis
        r = redis.Redis.from_url(redis_url)
        r.ping()
        return jsonify({"status": "ok", "message": "Redis is responsive"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 503


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

# Dual-index entity session registry:
#   connected_entities[sid]        -> {entityId, entityType}  (SID → entity, for fast disconnect lookup)
#   entity_sids[entityId]          -> set of SIDs             (entity → SIDs, for multi-tab aware offline detection)
connected_entities = {}
entity_sids = {}  # entityId -> set of active socket IDs

@socketio.on('connect')
def socket_connect():
    sid = request.sid
    # Attempt to authenticate the socket connection via JWT in handshake auth
    auth = request.args.get('token') or (request.environ.get('HTTP_AUTH_TOKEN'))
    if not auth:
        try:
            # socket.io-client sends auth as environ key
            auth = request.environ.get('socketio.auth', {}).get('token')
        except Exception:
            auth = None
    print(f"Socket connected: {sid} (auth={'present' if auth else 'none'})") 

@socketio.on('entity:register')
def socket_register(data):
    entity_id = data.get("entityId")
    entity_type = data.get("entityType")
    if not entity_id or not entity_type:
        emit('entity:register:error', {"message": "Missing entityId or entityType"})
        return

    sid = request.sid

    # Handle SID rotation: if this entity had a previous SID (e.g. reconnect), clean it up
    old_info = connected_entities.get(sid)
    if old_info and old_info["entityId"] != entity_id:
        # Different entity on this SID — shouldn't happen, but clean up old entry
        old_entity_id = old_info["entityId"]
        if old_entity_id in entity_sids:
            entity_sids[old_entity_id].discard(sid)

    # Register new SID for this entity
    connected_entities[sid] = {"entityId": entity_id, "entityType": entity_type}
    if entity_id not in entity_sids:
        entity_sids[entity_id] = set()
    is_new_connection = len(entity_sids[entity_id]) == 0
    entity_sids[entity_id].add(sid)

    join_room(f"entity:{entity_id}")
    join_room(f"type:{entity_type}")

    print(f"Registered: {entity_type} [{entity_id}] SID={sid} total_sids={len(entity_sids[entity_id])}")
    emit('entity:registered', {"success": True, "socketId": sid, "entityId": entity_id, "entityType": entity_type})
    # Only broadcast entity:online when it's a genuinely new connection (not a tab that was already online)
    if is_new_connection:
        emit('entity:online', {
            "entityId": entity_id,
            "entityType": entity_type,
            "timestamp": datetime.datetime.utcnow().isoformat()
        }, broadcast=True, include_self=False)

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

    # Socket handlers run outside HTTP request context, so we use a dedicated session
    # (not get_db() which is request-scoped). Always close it in finally.
    db = SessionLocal()
    try:
        if entity_type == 'user':
            speed = process_gps_speed_and_logs(db, entity_id, lat, lng)

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

        # Update entity's last known location
        now = datetime.datetime.utcnow()
        if entity_type in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
            db.query(User).filter(User.id == entity_id).update({
                "last_location_lat": lat,
                "last_location_lng": lng,
                "last_seen": now
            })
        elif entity_type == 'ambulance':
            db.query(AmbulanceDriver).filter(AmbulanceDriver.id == entity_id).update({
                "latitude": lat,
                "longitude": lng,
                "last_seen": now
            })
        elif entity_type == 'policeman':
            db.query(Policeman).filter(Policeman.id == entity_id).update({
                "latitude": lat,
                "longitude": lng,
                "last_seen": now
            })
        elif entity_type == 'mechanic':
            db.query(Mechanic).filter(Mechanic.id == entity_id).update({
                "latitude": lat,
                "longitude": lng,
                "last_seen": now
            })
        db.commit()

        payload = {
            "entityId": entity_id,
            "entityType": entity_type,
            "latitude": float(lat),
            "longitude": float(lng),
            "speed": float(speed) if speed else 0.0,
            "heading": float(heading) if heading else 0.0,
            "timestamp": now.isoformat()
        }

        # Only forward location to admin-type room (map viewers) — not all connected clients.
        # This prevents bandwidth waste and prevents leaking location data to unrelated clients.
        emit('location:update', payload, to='type:admin')
        emit('entity:location', payload, to='type:admin')

    except Exception as e:
        db.rollback()
        print(f"[Socket] Location update error for {entity_type}/{entity_id}: {e}")
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
                "responderType": entity_type,
                "type": entity_type,
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
    sid = request.sid
    entity = connected_entities.pop(sid, None)
    if entity:
        entity_id = entity["entityId"]
        entity_type = entity["entityType"]
        # Remove this SID from the entity's active SID set
        if entity_id in entity_sids:
            entity_sids[entity_id].discard(sid)
            # Only broadcast offline if entity has NO remaining active tabs/connections
            if len(entity_sids[entity_id]) == 0:
                del entity_sids[entity_id]
                emit('entity:offline', {
                    "entityId": entity_id,
                    "entityType": entity_type,
                    "timestamp": datetime.datetime.utcnow().isoformat()
                }, broadcast=True, include_self=False)
                print(f"Entity fully offline: {entity_type} [{entity_id}]")
                
                # Re-dispatch if en-route responder went offline
                db = SessionLocal()
                try:
                    active_route = db.query(Route).filter(
                        Route.from_entity_id == entity_id,
                        Route.status == 'active'
                    ).first()
                    if active_route:
                        acc_id = active_route.accident_id
                        print(f"⚠️ En-route responder {entity_id} went offline! Cancelling route and re-dispatching incident {acc_id}.")
                        active_route.status = 'failed'
                        
                        accident = db.query(Accident).filter(Accident.id == acc_id).first()
                        if accident:
                            accident.status = 'dispatched'
                            accident.responder_id = None
                            accident.responder_type = None
                            
                            log_accident_status(db, acc_id, 'alert_broadcasted', notes=f"Responder {entity_type} {entity_id} went offline. Re-opening assignment to other units.")
                            
                            # Re-trigger alerts dispatch in background
                            Thread(target=dispatch_emergency_response_bg, args=(acc_id,)).start()
                        db.commit()
                except Exception as ex:
                    print(f"Error handling responder offline: {ex}")
                finally:
                    db.close()
            else:
                print(f"Socket SID {sid} disconnected but entity {entity_id} still has {len(entity_sids[entity_id])} active tab(s)")
    else:
        print(f"Socket disconnected (unregistered): {sid}")

@socketio.on('test:trigger_broadcast')
def socket_test_trigger_broadcast(data):
    if data and data.get("isTest"):
        emit('accident:new', data, broadcast=True)

@socketio.on('ping')
def socket_ping(data=None):
    """Respond to client-side heartbeat pings with timestamp for RTT measurement."""
    client_ts = (data or {}).get('clientTime')
    emit('pong', {
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "clientTime": client_ts  # echo back for RTT calc on client
    })

# --- Bulk Device Generation ---
@app.route('/api/admin/devices/bulk', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_bulk_device_generation():
    data = request.json or {}
    count = data.get("count")
    if not count or not isinstance(count, int) or count <= 0:
        return jsonify({"success": False, "message": "Count must be a positive integer"}), 422
        
    db = get_db()
    generated = []
    
    for _ in range(count):
        while True:
            dev_code = "".join([str(random.randint(0, 9)) for _ in range(16)])
            if not db.query(Device).filter(Device.device_id == dev_code).first():
                break
                
        while True:
            pass_name = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
            if not db.query(Device).filter(Device.pass_name == pass_name).first():
                break
                
        pass_code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
        
        while True:
            sim_code = "".join([str(random.randint(0, 9)) for _ in range(13)])
            if not db.query(Device).filter(Device.sim_code == sim_code).first():
                break
                
        qr_payload = json.dumps({
            "deviceCode": dev_code,
            "passName": pass_name,
            "passCode": pass_code,
            "simCode": sim_code
        })
        
        device = Device(
            device_id=dev_code,
            pass_name=pass_name,
            pass_code=pass_code,
            sim_code=sim_code,
            qr_code=qr_payload,
            status='inactive',
            is_active=True,
            is_linked=False,
            battery_level=100,
            firmware_version='1.0.0'
        )
        db.add(device)
        db.commit()
        generated.append(device.to_json())
        
        audit = AuditLog(entity_type='admin', entity_id='admin-001', action='generate_device', details=f"Generated device {dev_code}")
        db.add(audit)
        db.commit()
        
    return jsonify({
        "success": True,
        "message": f"Successfully generated {count} devices in bulk",
        "devices": generated
    }), 201

@app.route('/api/admin/devices/inventory', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_devices_inventory():
    search = (request.args.get("search") or "").strip().lower()
    status = request.args.get("status")
    
    db = get_db()
    query = db.query(Device).filter(Device.is_linked == False)
    
    if status and status != 'all':
        query = query.filter(Device.status == status)
        
    devices = query.all()
    
    if search:
        devices = [
            d for d in devices 
            if search in d.device_id.lower()
            or (d.pass_name and search in d.pass_name.lower())
            or (d.sim_code and search in d.sim_code.lower())
        ]
        
    return jsonify({
        "success": True,
        "devices": [d.to_json() for d in devices]
    })

@app.route('/api/admin/devices/assigned', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_devices_assigned():
    search = (request.args.get("search") or "").strip().lower()
    
    db = get_db()
    devices = db.query(Device).filter(Device.is_linked == True).all()
    
    assigned = []
    for d in devices:
        user = db.query(User).filter(User.id == d.owner_id).first()
        vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
        
        item = {
            "id": d.id,
            "deviceCode": d.device_id,
            "passName": d.pass_name,
            "passcode": d.pass_code,
            "simCode": d.sim_code,
            "status": d.status,
            "is_active": d.is_active,
            "registrationDate": d.linked_at.isoformat() if d.linked_at else None,
            "userName": user.full_name if user else "Unknown",
            "mobile": user.mobile if user else "—",
            "vehicle": vehicle.to_json() if vehicle else None
        }
        
        if search:
            if (search in item["deviceCode"].lower() or 
                (item["passName"] and search in item["passName"].lower()) or
                (item["simCode"] and search in item["simCode"].lower()) or
                search in item["userName"].lower() or
                search in item["mobile"].lower()):
                assigned.append(item)
        else:
            assigned.append(item)
            
    return jsonify({
        "success": True,
        "devices": assigned
    })

@app.route('/api/admin/devices/<id>/status', methods=['PUT'])
@authenticate_jwt
@require_admin_role
def admin_toggle_device_status(id):
    data = request.json or {}
    status = data.get("status")
    
    if status not in ['active', 'inactive']:
        return jsonify({"success": False, "message": "Status must be 'active' or 'inactive'"}), 422
        
    db = get_db()
    device = db.query(Device).filter(Device.id == id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    device.status = status
    device.is_active = (status == 'active')
    db.commit()
    
    audit = AuditLog(entity_type='admin', entity_id='admin-001', action='toggle_device_status', details=f"Changed status of device {device.device_id} to {status}")
    db.add(audit)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": f"Device status set to {status}",
        "device": device.to_json()
    })

@app.route('/api/admin/devices/<id>', methods=['DELETE'])
@authenticate_jwt
@require_admin_role
def admin_delete_device(id):
    db = get_db()
    device = db.query(Device).filter(Device.id == id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    if device.is_linked:
        return jsonify({"success": False, "message": "Cannot delete a linked device. Unlink it first."}), 400
        
    db.delete(device)
    db.commit()
    
    audit = AuditLog(entity_type='admin', entity_id='admin-001', action='delete_device', details=f"Deleted device {device.device_id}")
    db.add(audit)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": "Device deleted successfully"
    })

# --- QR Pairing & Shared Devices ---
@app.route('/api/devices/register-qr', methods=['POST'])
@authenticate_jwt
@require_user_role
def register_device_qr():
    data = request.json or {}
    device_code = data.get("deviceCode")
    pass_name = data.get("passName")
    pass_code = data.get("passCode")
    sim_code = data.get("simCode")
    
    vehicle_type = data.get("vehicle_type", "Car")
    vehicle_number = data.get("vehicle_number")
    vehicle_model = data.get("vehicle_model")
    manufacturer = data.get("manufacturer")
    year = data.get("year")
    
    if not device_code or not pass_name or not pass_code or not sim_code:
        return jsonify({"success": False, "message": "Missing device verification parameters"}), 422
        
    if not vehicle_number:
        return jsonify({"success": False, "message": "Vehicle number is required"}), 422
        
    db = get_db()
    device = db.query(Device).filter(
        Device.device_id == device_code,
        Device.pass_name == pass_name,
        Device.pass_code == pass_code,
        Device.sim_code == sim_code
    ).first()
    
    if not device:
        return jsonify({"success": False, "message": "Device verification failed. Invalid credentials or unregistered device."}), 404
        
    if device.is_linked:
        return jsonify({"success": False, "message": "This device is already linked to another user."}), 409
        
    device.owner_id = g.user.id
    device.is_linked = True
    device.linked_at = datetime.datetime.utcnow()
    device.status = "active"
    device.is_active = True
    
    vehicle = VehicleInformation(
        user_id=g.user.id,
        device_id=device.id,
        vehicle_type=vehicle_type,
        vehicle_number=vehicle_number,
        vehicle_model=vehicle_model,
        manufacturer=manufacturer,
        year=int(year) if year else None
    )
    db.add(vehicle)
    
    g.user.vehicle_number = vehicle_number
    g.user.vehicle_type = vehicle_type
    db.add(g.user)
    
    audit = AuditLog(entity_type='user', entity_id=g.user.id, action='register_device', details=f"Linked device {device_code} to vehicle {vehicle_number}")
    db.add(audit)
    
    db.commit()
    
    return jsonify({
        "success": True,
        "message": "Device registered and vehicle details linked successfully",
        "device": device.to_json(),
        "vehicle": vehicle.to_json()
    }), 201

@app.route('/api/devices/my-devices', methods=['GET'])
@authenticate_jwt
@require_user_role
def get_my_devices():
    db = get_db()
    
    owned_devices = db.query(Device).filter(Device.owner_id == g.user.id, Device.is_linked == True).all()
    
    owned_list = []
    for d in owned_devices:
        vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
        owned_list.append({
            "device": d.to_json(),
            "vehicle": vehicle.to_json() if vehicle else None,
            "role": "owner"
        })
        
    shares = db.query(DeviceShare).filter(DeviceShare.user_id == g.user.id).all()
    shared_list = []
    for s in shares:
        d = db.query(Device).filter(Device.id == s.device_id).first()
        if d:
            vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
            owner = db.query(User).filter(User.id == d.owner_id).first()
            shared_list.append({
                "device": d.to_json(),
                "vehicle": vehicle.to_json() if vehicle else None,
                "role": "shared",
                "ownerName": owner.full_name if owner else "Unknown"
            })
            
    return jsonify({
        "success": True,
        "owned": owned_list,
        "shared": shared_list
    })

@app.route('/api/devices/share', methods=['POST'])
@authenticate_jwt
@require_user_role
def share_device_access():
    data = request.json or {}
    device_id = data.get("device_id")
    share_with_unique_id = data.get("share_with_id")
    
    if not device_id or not share_with_unique_id:
        return jsonify({"success": False, "message": "device_id and share_with_id are required"}), 422
        
    db = get_db()
    device = db.query(Device).filter(Device.id == device_id, Device.owner_id == g.user.id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found or access denied"}), 403
        
    target_user = db.query(User).filter(User.unique_id == share_with_unique_id, User.role == 'user').first()
    if not target_user:
        return jsonify({"success": False, "message": "User with this AapadBandhav ID not found"}), 404
        
    if target_user.id == g.user.id:
        return jsonify({"success": False, "message": "Cannot share device with yourself"}), 400
        
    existing = db.query(DeviceShare).filter(
        DeviceShare.device_id == device_id,
        DeviceShare.user_id == target_user.id
    ).first()
    
    if existing:
        return jsonify({"success": False, "message": "Device is already shared with this user"}), 409
        
    share = DeviceShare(
        device_id=device_id,
        user_id=target_user.id,
        role='viewer'
    )
    db.add(share)
    
    audit = AuditLog(entity_type='user', entity_id=g.user.id, action='share_device', details=f"Shared device {device.device_id} with user {target_user.unique_id}")
    db.add(audit)
    
    db.commit()
    return jsonify({
        "success": True,
        "message": f"Successfully shared device with {target_user.full_name}",
        "share": share.to_json()
    }), 201

@app.route('/api/devices/unshare', methods=['POST'])
@authenticate_jwt
@require_user_role
def revoke_device_share():
    data = request.json or {}
    device_id = data.get("device_id")
    target_user_id = data.get("user_id")
    
    if not device_id or not target_user_id:
        return jsonify({"success": False, "message": "device_id and user_id are required"}), 422
        
    db = get_db()
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    if device.owner_id != g.user.id and target_user_id != g.user.id:
        return jsonify({"success": False, "message": "Access denied"}), 403
        
    share = db.query(DeviceShare).filter(
        DeviceShare.device_id == device_id,
        DeviceShare.user_id == target_user_id
    ).first()
    
    if not share:
        return jsonify({"success": False, "message": "No active share found for this device and user"}), 404
        
    db.delete(share)
    
    audit = AuditLog(entity_type='user', entity_id=g.user.id, action='unshare_device', details=f"Unshared device {device.device_id} from user {target_user_id}")
    db.add(audit)
    
    db.commit()
    return jsonify({
        "success": True,
        "message": "Device sharing access revoked successfully"
    })

@app.route('/api/devices/shares/<device_id>', methods=['GET'])
@authenticate_jwt
@require_user_role
def get_device_shares(device_id):
    db = get_db()
    device = db.query(Device).filter(Device.id == device_id, Device.owner_id == g.user.id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found or access denied"}), 403
        
    shares = db.query(DeviceShare).filter(DeviceShare.device_id == device_id).all()
    result = []
    for s in shares:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            result.append({
                "id": s.id,
                "user_id": u.id,
                "full_name": u.full_name,
                "mobile": u.mobile,
                "unique_id": u.unique_id,
                "role": s.role,
                "created_at": s.created_at.isoformat()
            })
            
    return jsonify({
        "success": True,
        "shares": result
    })

# --- Additional Device Validation, QR Registration, sharing and Admin Bulk APIs ---

@app.route('/api/devices/validate-qr', methods=['POST'])
@authenticate_jwt
@require_user_role
def validate_qr_code():
    data = request.json or {}
    qr_code = data.get("qrCode") or data.get("deviceId")
    if not qr_code:
        return jsonify({"success": False, "message": "qrCode or deviceId is required"}), 422
    
    # Check if qrCode is JSON payload
    device_code = None
    if isinstance(qr_code, str) and qr_code.strip().startswith("{") and qr_code.strip().endswith("}"):
        try:
            payload = json.loads(qr_code)
            device_code = payload.get("deviceId")
        except Exception:
            pass
    if not device_code:
        if isinstance(qr_code, dict):
            device_code = qr_code.get("deviceId")
        else:
            device_code = str(qr_code).strip()
            
    db = get_db()
    device = db.query(Device).filter(Device.device_id == device_code).first()
    if not device:
        return jsonify({"success": False, "message": "Invalid QR code. Device not found.", "code": "not_found"}), 404
        
    if device.is_linked:
        return jsonify({"success": False, "message": "This device is already linked to another user.", "code": "already_linked"}), 409
        
    return jsonify({
        "success": True,
        "message": "Device is valid and available for registration",
        "device": device.to_json()
    })

@app.route('/api/devices/register-by-qr', methods=['POST'])
@authenticate_jwt
@require_user_role
def register_device_by_qr():
    data = request.json or {}
    qr_code = data.get("qrCode") or data.get("deviceId")
    vehicle_type = data.get("vehicle_type", "Car")
    vehicle_number = data.get("vehicle_number")
    vehicle_model = data.get("vehicle_model")
    manufacturer = data.get("manufacturer")
    year = data.get("year")
    
    if not qr_code:
        return jsonify({"success": False, "message": "qrCode or deviceId is required"}), 422
        
    if not vehicle_number:
        return jsonify({"success": False, "message": "Vehicle number is required"}), 422
        
    device_code = None
    if isinstance(qr_code, str) and qr_code.strip().startswith("{") and qr_code.strip().endswith("}"):
        try:
            payload = json.loads(qr_code)
            device_code = payload.get("deviceId")
        except Exception:
            pass
    if not device_code:
        if isinstance(qr_code, dict):
            device_code = qr_code.get("deviceId")
        else:
            device_code = str(qr_code).strip()
            
    db = get_db()
    device = db.query(Device).filter(Device.device_id == device_code).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found."}), 404
        
    if device.is_linked:
        return jsonify({"success": False, "message": "This device is already linked to another user."}), 409
        
    device.owner_id = g.user.id
    device.is_linked = True
    device.linked_at = datetime.datetime.utcnow()
    device.status = "active"
    device.is_active = True
    
    existing_vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == device.id).first()
    if existing_vehicle:
        db.delete(existing_vehicle)
        
    vehicle = VehicleInformation(
        user_id=g.user.id,
        device_id=device.id,
        vehicle_type=vehicle_type,
        vehicle_number=vehicle_number,
        vehicle_model=vehicle_model,
        manufacturer=manufacturer,
        year=int(year) if year else None
    )
    db.add(vehicle)
    
    g.user.vehicle_number = vehicle_number
    g.user.vehicle_type = vehicle_type
    db.add(g.user)
    
    audit = AuditLog(entity_type='user', entity_id=g.user.id, action='register_device', details=f"Linked device {device_code} to vehicle {vehicle_number} via QR")
    db.add(audit)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": "Device registered and vehicle details linked successfully",
        "device": device.to_json(),
        "vehicle": vehicle.to_json()
    }), 201

@app.route('/api/devices/<deviceId>/share', methods=['POST'])
@authenticate_jwt
@require_user_role
def share_device_by_path(deviceId):
    data = request.json or {}
    share_with_unique_id = data.get("share_with_id")
    if not share_with_unique_id:
        return jsonify({"success": False, "message": "share_with_id is required"}), 422
        
    db = get_db()
    device = db.query(Device).filter((Device.id == deviceId) | (Device.device_id == deviceId)).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    if device.owner_id != g.user.id:
        return jsonify({"success": False, "message": "Access denied. Only the owner can share the device."}), 403
        
    target_user = db.query(User).filter(User.unique_id == share_with_unique_id, User.role == 'user').first()
    if not target_user:
        return jsonify({"success": False, "message": "User with this AapadBandhav ID not found"}), 404
        
    if target_user.id == g.user.id:
        return jsonify({"success": False, "message": "Cannot share device with yourself"}), 400
        
    existing = db.query(DeviceShare).filter(
        DeviceShare.device_id == device.id,
        DeviceShare.user_id == target_user.id
    ).first()
    if existing:
        return jsonify({"success": False, "message": "Device is already shared with this user"}), 409
        
    share = DeviceShare(
        device_id=device.id,
        user_id=target_user.id,
        role='viewer'
    )
    db.add(share)
    
    audit = AuditLog(entity_type='user', entity_id=g.user.id, action='share_device', details=f"Shared device {device.device_id} with user {target_user.unique_id}")
    db.add(audit)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": f"Successfully shared device with {target_user.full_name}",
        "share": share.to_json()
    }), 201

@app.route('/api/devices/<deviceId>/shared-user/<userId>', methods=['DELETE'])
@authenticate_jwt
@require_user_role
def revoke_share_by_path(deviceId, userId):
    db = get_db()
    device = db.query(Device).filter((Device.id == deviceId) | (Device.device_id == deviceId)).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    if device.owner_id != g.user.id and userId != g.user.id:
        return jsonify({"success": False, "message": "Access denied"}), 403
        
    share = db.query(DeviceShare).filter(
        DeviceShare.device_id == device.id,
        DeviceShare.user_id == userId
    ).first()
    if not share:
        return jsonify({"success": False, "message": "No active share found for this device and user"}), 404
        
    db.delete(share)
    
    audit = AuditLog(entity_type='user', entity_id=g.user.id, action='unshare_device', details=f"Unshared device {device.device_id} from user {userId}")
    db.add(audit)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": "Device sharing access revoked successfully"
    })

@app.route('/api/devices/<deviceId>/owner', methods=['GET'])
@authenticate_jwt
@require_user_role
def get_device_owner(deviceId):
    db = get_db()
    device = db.query(Device).filter((Device.id == deviceId) | (Device.device_id == deviceId)).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    is_owner = (device.owner_id == g.user.id)
    is_shared = False
    if not is_owner:
        share = db.query(DeviceShare).filter(DeviceShare.device_id == device.id, DeviceShare.user_id == g.user.id).first()
        is_shared = (share is not None)
        
    if not is_owner and not is_shared:
        return jsonify({"success": False, "message": "Access denied"}), 403
        
    owner = db.query(User).filter(User.id == device.owner_id).first()
    if not owner:
        return jsonify({"success": False, "message": "Owner not found"}), 404
        
    return jsonify({
        "success": True,
        "owner": {
            "id": owner.id,
            "full_name": owner.full_name,
            "unique_id": owner.unique_id,
            "mobile": owner.mobile,
            "email": owner.email
        }
    })

@app.route('/api/devices/<deviceId>/shared-users', methods=['GET'])
@authenticate_jwt
@require_user_role
def get_device_shared_users(deviceId):
    db = get_db()
    device = db.query(Device).filter((Device.id == deviceId) | (Device.device_id == deviceId)).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    if device.owner_id != g.user.id:
        return jsonify({"success": False, "message": "Access denied"}), 403
        
    shares = db.query(DeviceShare).filter(DeviceShare.device_id == device.id).all()
    result = []
    for s in shares:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            result.append({
                "id": s.id,
                "user_id": u.id,
                "full_name": u.full_name,
                "mobile": u.mobile,
                "unique_id": u.unique_id,
                "role": s.role,
                "created_at": s.created_at.isoformat()
            })
            
    return jsonify({
        "success": True,
        "shares": result
    })

@app.route('/api/devices/my-accessible-devices', methods=['GET'])
@authenticate_jwt
@require_user_role
def get_my_accessible_devices():
    db = get_db()
    
    owned_devices = db.query(Device).filter(Device.owner_id == g.user.id, Device.is_linked == True).all()
    owned_list = []
    for d in owned_devices:
        vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
        owned_list.append({
            "device": d.to_json(),
            "vehicle": vehicle.to_json() if vehicle else None,
            "role": "owner"
        })
        
    shares = db.query(DeviceShare).filter(DeviceShare.user_id == g.user.id).all()
    shared_list = []
    for s in shares:
        d = db.query(Device).filter(Device.id == s.device_id).first()
        if d:
            vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
            owner = db.query(User).filter(User.id == d.owner_id).first()
            shared_list.append({
                "device": d.to_json(),
                "vehicle": vehicle.to_json() if vehicle else None,
                "role": "shared",
                "ownerName": owner.full_name if owner else "Unknown",
                "owner_id": owner.id if owner else None
            })
            
    return jsonify({
        "success": True,
        "devices": owned_list + shared_list,
        "owned": owned_list,
        "shared": shared_list
    })

@app.route('/api/live-map/my-devices', methods=['GET'])
@authenticate_jwt
@require_user_role
def get_live_map_my_devices():
    db = get_db()
    
    owned = db.query(Device).filter(Device.owner_id == g.user.id, Device.is_linked == True).all()
    shares = db.query(DeviceShare).filter(DeviceShare.user_id == g.user.id).all()
    
    devices_data = []
    
    for d in owned:
        vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
        # Prioritize device-specific location coordinates
        loc = db.query(LiveLocation).filter(
            LiveLocation.entity_id == d.device_id,
            LiveLocation.entity_type == 'device'
        ).order_by(desc(LiveLocation.recorded_at)).first()
        
        # Fall back to user location if no device location is available
        if not loc:
            loc = db.query(LiveLocation).filter(
                LiveLocation.entity_id == g.user.id,
                LiveLocation.entity_type == 'user'
            ).order_by(desc(LiveLocation.recorded_at)).first()
        
        devices_data.append({
            "id": d.id,
            "device_id": d.device_id,
            "status": d.status,
            "battery_level": d.battery_level,
            "current_speed": d.current_speed,
            "latitude": float(loc.latitude) if loc else None,
            "longitude": float(loc.longitude) if loc else None,
            "last_seen": loc.recorded_at.isoformat() if loc else d.last_ping.isoformat() if d.last_ping else None,
            "role": "owner",
            "vehicle": vehicle.to_json() if vehicle else None,
            "owner": {
                "id": g.user.id,
                "full_name": g.user.full_name
            }
        })
        
    for s in shares:
        d = db.query(Device).filter(Device.id == s.device_id).first()
        if d:
            vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
            owner = db.query(User).filter(User.id == d.owner_id).first()
            if owner:
                # Prioritize device-specific location coordinates
                loc = db.query(LiveLocation).filter(
                    LiveLocation.entity_id == d.device_id,
                    LiveLocation.entity_type == 'device'
                ).order_by(desc(LiveLocation.recorded_at)).first()
                
                # Fall back to owner location if no device location is available
                if not loc:
                    loc = db.query(LiveLocation).filter(
                        LiveLocation.entity_id == owner.id,
                        LiveLocation.entity_type == 'user'
                    ).order_by(desc(LiveLocation.recorded_at)).first()
                
                devices_data.append({
                    "id": d.id,
                    "device_id": d.device_id,
                    "status": d.status,
                    "battery_level": d.battery_level,
                    "current_speed": d.current_speed,
                    "latitude": float(loc.latitude) if loc else None,
                    "longitude": float(loc.longitude) if loc else None,
                    "last_seen": loc.recorded_at.isoformat() if loc else d.last_ping.isoformat() if d.last_ping else None,
                    "role": "shared",
                    "vehicle": vehicle.to_json() if vehicle else None,
                    "owner": {
                        "id": owner.id,
                        "full_name": owner.full_name
                    }
                })
                
    return jsonify({
        "success": True,
        "devices": devices_data
    })

# --- Admin Device Shares APIs ---

@app.route('/api/admin/devices/shares', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_all_device_shares():
    db = get_db()
    shares = db.query(DeviceShare).all()
    
    result = []
    for s in shares:
        device = db.query(Device).filter(Device.id == s.device_id).first()
        owner = db.query(User).filter(User.id == device.owner_id).first() if device else None
        target_user = db.query(User).filter(User.id == s.user_id).first()
        
        result.append({
            "share_id": s.id,
            "device_id": device.id if device else None,
            "device_code": device.device_id if device else "Unknown",
            "owner_id": owner.id if owner else None,
            "owner_name": owner.full_name if owner else "Unknown",
            "owner_unique_id": owner.unique_id if owner else "—",
            "shared_with_id": target_user.id if target_user else None,
            "shared_with_name": target_user.full_name if target_user else "Unknown",
            "shared_with_unique_id": target_user.unique_id if target_user else "—",
            "shared_with_mobile": target_user.mobile if target_user else "—",
            "role": s.role,
            "created_at": s.created_at.isoformat() if s.created_at else None
        })
        
    return jsonify({
        "success": True,
        "shares": result
    })

@app.route('/api/admin/devices/shares/<share_id>', methods=['DELETE'])
@authenticate_jwt
@require_admin_role
def admin_delete_device_share(share_id):
    db = get_db()
    share = db.query(DeviceShare).filter(DeviceShare.id == share_id).first()
    if not share:
        return jsonify({"success": False, "message": "Share not found"}), 404
        
    db.delete(share)
    db.commit()
    return jsonify({"success": True, "message": "Device share revoked successfully"})

# --- Admin Bulk Action APIs ---

@app.route('/api/admin/devices/bulk-activate', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_bulk_activate():
    data = request.json or {}
    device_ids = data.get("deviceIds", [])
    if not device_ids:
        return jsonify({"success": False, "message": "No devices specified"}), 400
        
    db = get_db()
    devices = db.query(Device).filter(Device.id.in_(device_ids)).all()
    count = 0
    for d in devices:
        d.status = 'active'
        d.is_active = True
        count += 1
        
    db.commit()
    
    audit = AuditLog(entity_type='admin', entity_id='admin-001', action='bulk_activate_devices', details=f"Bulk activated {count} devices")
    db.add(audit)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": f"Successfully activated {count} devices"
    })

@app.route('/api/admin/devices/bulk-deactivate', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_bulk_deactivate():
    data = request.json or {}
    device_ids = data.get("deviceIds", [])
    if not device_ids:
        return jsonify({"success": False, "message": "No devices specified"}), 400
        
    db = get_db()
    devices = db.query(Device).filter(Device.id.in_(device_ids)).all()
    count = 0
    for d in devices:
        d.status = 'inactive'
        d.is_active = False
        count += 1
        
    db.commit()
    
    audit = AuditLog(entity_type='admin', entity_id='admin-001', action='bulk_deactivate_devices', details=f"Bulk deactivated {count} devices")
    db.add(audit)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": f"Successfully deactivated {count} devices"
    })

@app.route('/api/admin/devices/bulk-delete', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_bulk_delete():
    data = request.json or {}
    device_ids = data.get("deviceIds", [])
    if not device_ids:
        return jsonify({"success": False, "message": "No devices specified"}), 400
        
    db = get_db()
    devices = db.query(Device).filter(Device.id.in_(device_ids)).all()
    count = 0
    for d in devices:
        db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).delete()
        db.query(DeviceShare).filter(DeviceShare.device_id == d.id).delete()
        db.query(IoTNode).filter(IoTNode.device_id == d.id).delete()
        db.delete(d)
        count += 1
        
    db.commit()
    
    audit = AuditLog(entity_type='admin', entity_id='admin-001', action='bulk_delete_devices', details=f"Bulk deleted {count} devices")
    db.add(audit)
    db.commit()
    
    return jsonify({
        "success": True,
        "message": f"Successfully deleted {count} devices"
    })

@app.route('/api/admin/devices/bulk-export', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_bulk_export():
    data = request.json or {}
    device_ids = data.get("deviceIds", [])
    db = get_db()
    query = db.query(Device)
    if device_ids:
        query = query.filter(Device.id.in_(device_ids))
    devices = query.all()
    
    export_data = []
    for d in devices:
        owner = db.query(User).filter(User.id == d.owner_id).first() if d.owner_id else None
        vehicle = db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
        export_data.append({
            "id": d.id,
            "device_id": d.device_id,
            "sim_code": d.sim_code,
            "pass_name": d.pass_name,
            "pass_code": d.pass_code,
            "is_active": d.is_active,
            "is_linked": d.is_linked,
            "status": d.status,
            "battery_level": d.battery_level,
            "linked_at": d.linked_at.isoformat() if d.linked_at else None,
            "owner_name": owner.full_name if owner else None,
            "owner_mobile": owner.mobile if owner else None,
            "vehicle_number": vehicle.vehicle_number if vehicle else None,
            "vehicle_type": vehicle.vehicle_type if vehicle else None
        })
        
    return jsonify({
        "success": True,
        "devices": export_data
    })

@app.route('/api/admin/devices/bulk-qr-download', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_bulk_qr_download():
    data = request.json or {}
    device_ids = data.get("deviceIds", [])
    if not device_ids:
        return jsonify({"success": False, "message": "No devices specified"}), 400
        
    db = get_db()
    devices = db.query(Device).filter(Device.id.in_(device_ids)).all()
    
    qr_payloads = []
    for d in devices:
        payload = {
            "deviceId": d.device_id,
            "type": "device_registration"
        }
        qr_payloads.append({
            "id": d.id,
            "device_id": d.device_id,
            "qr_payload": json.dumps(payload),
            "pass_name": d.pass_name
        })
        
    return jsonify({
        "success": True,
        "qrs": qr_payloads
    })

# --- Future Handset Safety APIs placeholders ---
@app.route('/api/safety/panic', methods=['POST'])
@authenticate_jwt
def handset_panic_alert():
    return jsonify({
        "success": True,
        "message": "Future Expansion API placeholder: Panic Alert triggered successfully",
        "status": "staged",
        "timestamp": datetime.datetime.utcnow().isoformat()
    })

@app.route('/api/safety/women-safety', methods=['POST'])
@authenticate_jwt
def handset_women_safety_alert():
    return jsonify({
        "success": True,
        "message": "Future Expansion API placeholder: Women Safety Mode enabled",
        "status": "staged",
        "timestamp": datetime.datetime.utcnow().isoformat()
    })

@app.route('/api/safety/shake-detect', methods=['POST'])
@authenticate_jwt
def handset_shake_detection():
    return jsonify({
        "success": True,
        "message": "Future Expansion API placeholder: Shake Detection active",
        "status": "staged",
        "timestamp": datetime.datetime.utcnow().isoformat()
    })

@app.route('/api/safety/audio-record', methods=['POST'])
@authenticate_jwt
def handset_emergency_audio_recording():
    return jsonify({
        "success": True,
        "message": "Future Expansion API placeholder: Emergency Audio Recording staged",
        "status": "staged",
        "timestamp": datetime.datetime.utcnow().isoformat()
    })

@app.route('/api/safety/location-share', methods=['POST'])
@authenticate_jwt
def handset_live_location_sharing():
    return jsonify({
        "success": True,
        "message": "Future Expansion API placeholder: Live Location Sharing session staged",
        "status": "staged",
        "timestamp": datetime.datetime.utcnow().isoformat()
    })



# --- OpenAPI Spec / Swagger JSON ---
@app.route('/api/openapi.json', methods=['GET'])
@app.route('/openapi.json', methods=['GET'])
def get_openapi_spec():
    from src.config.openapi_spec import openapi_spec
    return jsonify(openapi_spec)

@app.route('/api/docs', methods=['GET'])
@app.route('/swagger', methods=['GET'])
@app.route('/swagger-ui', methods=['GET'])
def swagger_docs():
    return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>AapadBandhav API Documentation & Test Suite</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3/swagger-ui.css">
    <style>
        html { box-sizing: border-box; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .swagger-ui .topbar { background-color: #0f172a; border-bottom: 3px solid #3b82f6; padding: 12px 0; }
        .swagger-ui .info .title { font-size: 32px; color: #1e293b; font-weight: 800; }
        .swagger-ui .btn.authorize { border-color: #10b981; color: #10b981; background-color: transparent; }
        .swagger-ui .btn.authorize svg { fill: #10b981; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: "/api/openapi.json",
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "BaseLayout"
            });
            window.ui = ui;
        };
    </script>
</body>
</html>"""


# ─── Stop & Rest Detection, Routing and Diagnostics APIs ──────────────────────

socket_diagnostics = {
    "reconnection_attempts": 0,
    "failed_connections": 0,
    "successful_deliveries": 0,
    "events_emitted": 0
}

def check_and_update_device_stops(db, device, lat, lng, speed):
    try:
        now = datetime.datetime.utcnow()
        active_seg = db.query(RestSegment).filter(
            RestSegment.device_id == device.device_id,
            RestSegment.end_time == None
        ).first()

        is_stopped = speed < 5.0

        if is_stopped:
            if not active_seg:
                prev_seg = db.query(RestSegment).filter(
                    RestSegment.device_id == device.device_id
                ).order_by(desc(RestSegment.created_at)).first()

                stop_num = (prev_seg.stop_number + 1) if prev_seg else 1
                
                new_seg = RestSegment(
                    device_id=device.device_id,
                    latitude=lat,
                    longitude=lng,
                    stop_number=stop_num,
                    start_time=now,
                    end_time=None
                )

                if prev_seg:
                    if prev_seg.end_time is None:
                        prev_seg.end_time = now
                        prev_seg.stop_duration_seconds = int((now - prev_seg.start_time).total_seconds())
                        db.add(prev_seg)

                    logs = db.query(GPSSpeedLog).filter(
                        GPSSpeedLog.device_id == device.id,
                        GPSSpeedLog.timestamp >= prev_seg.end_time,
                        GPSSpeedLog.timestamp <= now
                    ).order_by(GPSSpeedLog.timestamp).all()

                    path = [{"lat": float(l.latitude), "lng": float(l.longitude)} for l in logs]
                    if not path:
                        path = [
                            {"lat": float(prev_seg.latitude), "lng": float(prev_seg.longitude)},
                            {"lat": float(lat), "lng": float(lng)}
                        ]

                    dist = 0.0
                    for i in range(len(path) - 1):
                        dist += haversine_distance(path[i]['lat'], path[i]['lng'], path[i+1]['lat'], path[i+1]['lng'])

                    duration = int((now - prev_seg.end_time).total_seconds())
                    avg_sp = 0.0
                    if duration > 0:
                        avg_sp = dist / (duration / 3600.0)

                    new_seg.travel_path = path
                    new_seg.travel_distance_km = dist
                    new_seg.travel_duration_seconds = duration
                    new_seg.avg_speed_kmh = min(avg_sp, 120.0)

                    notif_msg = f"Vehicle {device.pass_name or device.device_id} moved from Rest Position {prev_seg.stop_number} to Rest Position {new_seg.stop_number}. Distance: {round(dist, 2)}km, Travel Duration: {round(duration/60, 1)} mins."
                    payload = {
                        "device_id": device.device_id,
                        "device_name": device.pass_name or device.device_id,
                        "from_stop": prev_seg.stop_number,
                        "to_stop": new_seg.stop_number,
                        "distance_km": round(dist, 2),
                        "duration_seconds": duration,
                        "avg_speed_kmh": round(min(avg_sp, 120.0), 2),
                        "rest_duration_seconds": prev_seg.stop_duration_seconds,
                        "message": notif_msg
                    }
                    socketio.emit(f"device:{device.device_id}:movement", payload)
                    if device.owner_id:
                        socketio.emit("device:movement", payload, to=f"user:{device.owner_id}")

                db.add(new_seg)
                db.commit()
        else:
            if active_seg:
                active_seg.end_time = now
                active_seg.stop_duration_seconds = int((now - active_seg.start_time).total_seconds())
                db.add(active_seg)
                db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error in rest detection: {e}")

@app.route('/api/devices/<device_id>/stops', methods=['GET'])
@authenticate_jwt
def get_device_stops(device_id):
    db = get_db()
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404

    is_authorized = False
    is_owner = False
    if g.entity_role in ('user', 'volunteer', 'fire_department', 'emergency_personnel') and device.owner_id == g.entity_id:
        is_authorized = True
        is_owner = True
    else:
        share = db.query(DeviceShare).filter(DeviceShare.device_id == device.id, DeviceShare.user_id == g.entity_id).first()
        if share:
            is_authorized = True

    if not is_authorized:
        return jsonify({"success": False, "message": "Access denied"}), 403

    stops = db.query(RestSegment).filter(RestSegment.device_id == device_id).order_by(RestSegment.stop_number).all()
    
    return jsonify({
        "success": True,
        "is_owner": is_owner,
        "stops": [s.to_json() for s in stops]
    })

@app.route('/api/devices/<device_id>/rename', methods=['PUT'])
@authenticate_jwt
@require_user_role
def rename_device(device_id):
    data = request.json or {}
    new_name = data.get("name")
    if not new_name:
        return jsonify({"success": False, "message": "name is required"}), 400

    db = get_db()
    device = db.query(Device).filter(Device.device_id == device_id, Device.owner_id == g.user.id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found or not owned by you"}), 404

    device.pass_name = new_name
    db.commit()

    return jsonify({"success": True, "message": "Device renamed successfully", "device": device.to_json()})

@app.route('/api/devices/<device_id>/logs', methods=['GET'])
@authenticate_jwt
def get_device_logs(device_id):
    db = get_db()
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404

    is_authorized = False
    if g.entity_role in ('user', 'volunteer', 'fire_department', 'emergency_personnel') and device.owner_id == g.entity_id:
        is_authorized = True
    else:
        share = db.query(DeviceShare).filter(DeviceShare.device_id == device.id, DeviceShare.user_id == g.entity_id).first()
        if share:
            is_authorized = True

    if not is_authorized:
        return jsonify({"success": False, "message": "Access denied"}), 403

    logs = db.query(GPSSpeedLog).filter(GPSSpeedLog.device_id == device.id).order_by(desc(GPSSpeedLog.timestamp)).limit(200).all()
    
    return jsonify({
        "success": True,
        "logs": [{
            "id": l.id,
            "latitude": float(l.latitude),
            "longitude": float(l.longitude),
            "speed": float(l.speed) if l.speed is not None else 0.0,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None
        } for l in logs]
    })

@app.route('/api/routes', methods=['POST'])
@authenticate_jwt
def create_navigation_route():
    data = request.json or {}
    accident_id = data.get("accident_id")
    from_lat = data.get("from_lat")
    from_lng = data.get("from_lng")

    if not accident_id or from_lat is None or from_lng is None:
        return jsonify({"success": False, "message": "accident_id, from_lat, and from_lng are required"}), 400

    db = get_db()
    accident = db.query(Accident).filter(Accident.id == accident_id).first()
    if not accident:
        return jsonify({"success": False, "message": "Accident not found"}), 404

    to_lat = float(accident.latitude)
    to_lng = float(accident.longitude)
    from_lat = float(from_lat)
    from_lng = float(from_lng)

    existing_route = db.query(Route).filter(
        Route.accident_id == accident_id,
        Route.from_entity_id == g.entity_id,
        Route.status == 'active'
    ).first()

    if existing_route:
        return jsonify({"success": True, "route": existing_route.to_json()})

    dist = haversine_distance(from_lat, from_lng, to_lat, to_lng)
    eta = estimate_eta(dist, 40)
    pts = generate_route_points(from_lat, from_lng, to_lat, to_lng)

    new_route = Route(
        accident_id=accident_id,
        from_entity_id=g.entity_id,
        from_entity_type=g.entity_role,
        to_lat=to_lat,
        to_lng=to_lng,
        distance_km=dist,
        eta_minutes=eta,
        route_points=pts,
        status='active'
    )
    db.add(new_route)
    db.commit()

    return jsonify({"success": True, "route": new_route.to_json()})

@app.route('/api/routes/<id>', methods=['GET'])
@authenticate_jwt
def get_navigation_route(id):
    db = get_db()
    route = db.query(Route).filter(Route.id == id).first()
    if not route:
        return jsonify({"success": False, "message": "Route not found"}), 404
    return jsonify({"success": True, "route": route.to_json()})

@app.route('/api/routes/<id>/location', methods=['PUT'])
@authenticate_jwt
@audit_action('update_navigation_location')
def update_route_location(id):
    data = request.json or {}
    lat = data.get("latitude")
    lng = data.get("longitude")

    if lat is None or lng is None:
        return jsonify({"success": False, "message": "latitude and longitude are required"}), 400

    lat = float(lat)
    lng = float(lng)

    db = get_db()
    route = db.query(Route).filter(Route.id == id).first()
    if not route:
        return jsonify({"success": False, "message": "Route not found"}), 404

    to_lat = float(route.to_lat)
    to_lng = float(route.to_lng)
    dist_to_dest = haversine_distance(lat, lng, to_lat, to_lng)
    eta = estimate_eta(dist_to_dest, 40)

    route_points = route.route_points or []
    min_dist = float('inf')
    for pt in route_points:
        d = haversine_distance(lat, lng, float(pt['lat']), float(pt['lng']))
        if d < min_dist:
            min_dist = d

    recalculated = False
    if min_dist > 0.2:
        recalculated = True
        route_points = generate_route_points(lat, lng, to_lat, to_lng)
        route.route_points = route_points
        route.distance_km = dist_to_dest
        route.eta_minutes = eta
        route.updated_at = datetime.datetime.utcnow()

    role = g.entity_role
    if role in ('user', 'volunteer', 'fire_department', 'emergency_personnel'):
        db.query(User).filter(User.id == g.entity_id).update({"last_location_lat": lat, "last_location_lng": lng, "last_seen": datetime.datetime.utcnow()})
    elif role == 'hospital':
        db.query(Hospital).filter(Hospital.id == g.entity_id).update({"latitude": lat, "longitude": lng})
    elif role == 'ambulance':
        db.query(AmbulanceDriver).filter(AmbulanceDriver.id == g.entity_id).update({"latitude": lat, "longitude": lng})
    elif role == 'police_station':
        db.query(PoliceStation).filter(PoliceStation.id == g.entity_id).update({"latitude": lat, "longitude": lng})
    elif role == 'policeman':
        db.query(Policeman).filter(Policeman.id == g.entity_id).update({"latitude": lat, "longitude": lng})
    elif role == 'mechanic':
        db.query(Mechanic).filter(Mechanic.id == g.entity_id).update({"latitude": lat, "longitude": lng})

    # Geofencing automatic status transitions
    if route.accident_id:
        last_log = db.query(AccidentStatusLog).filter(
            AccidentStatusLog.accident_id == route.accident_id
        ).order_by(desc(AccidentStatusLog.created_at)).first()
        last_status = last_log.status if last_log else None
        
        if dist_to_dest <= 0.1:
            if last_status not in ['arrived', 'victim_located', 'assistance_in_progress', 'victim_transported', 'resolved', 'closed']:
                db.query(Accident).filter(Accident.id == route.accident_id).update({"status": "arrived"})
                log_accident_status(db, route.accident_id, 'arrived', responder_id=g.entity_id, responder_type=g.entity_role, notes="Automatic Geofence Arrival: Responder entered 100m radius of the incident.")
        elif dist_to_dest <= 0.3:
            if last_status not in ['near_incident', 'arrived', 'victim_located', 'assistance_in_progress', 'victim_transported', 'resolved', 'closed']:
                db.query(Accident).filter(Accident.id == route.accident_id).update({"status": "near_incident"})
                log_accident_status(db, route.accident_id, 'near_incident', responder_id=g.entity_id, responder_type=g.entity_role, notes="Proximity Alert: Responder is within 300m of the incident.")

    db.commit()

    socket_payload = {
        "routeId": route.id,
        "accidentId": route.accident_id,
        "responderId": g.entity_id,
        "responderType": g.entity_role,
        "latitude": lat,
        "longitude": lng,
        "distanceToDestKm": round(dist_to_dest, 2),
        "etaMinutes": eta,
        "recalculated": recalculated
    }
    socketio.emit(f"route:{route.id}:update", socket_payload)
    socketio.emit(f"accident:{route.accident_id}:tracking", socket_payload)

    if recalculated:
        socketio.emit(f"route:{route.id}:recalculated", {"route_points": route_points})

    return jsonify({
        "success": True,
        "route": route.to_json(),
        "recalculated": recalculated,
        "distanceToDestKm": round(dist_to_dest, 2),
        "etaMinutes": eta
    })

@app.route('/api/routes/<id>/complete', methods=['POST'])
@authenticate_jwt
def complete_route(id):
    db = get_db()
    route = db.query(Route).filter(Route.id == id).first()
    if not route:
        return jsonify({"success": False, "message": "Route not found"}), 404

    route.status = 'completed'
    route.updated_at = datetime.datetime.utcnow()
    db.commit()

    socketio.emit(f"route:{route.id}:completed", {
        "routeId": route.id,
        "accidentId": route.accident_id,
        "responderId": g.entity_id,
        "responderType": g.entity_role
    })

    return jsonify({"success": True, "message": "Route marked as completed"})

@app.route('/api/admin/sockets/monitor', methods=['GET'])
@authenticate_jwt
def socket_monitor():
    if g.entity_role not in ('admin', 'superadmin'):
        return jsonify({"success": False, "message": "Admin access required"}), 403

    active_sockets = []
    for sid, info in connected_entities.items():
        active_sockets.append({
            "socket_id": sid,
            "entity_id": info.get("entityId"),
            "entity_type": info.get("entityType")
        })

    return jsonify({
        "success": True,
        "active_sockets_count": len(connected_entities),
        "active_sockets": active_sockets,
        "diagnostics": {
            "reconnection_attempts": socket_diagnostics["reconnection_attempts"],
            "failed_connections": socket_diagnostics["failed_connections"],
            "successful_deliveries": socket_diagnostics["successful_deliveries"],
            "delivery_success_rate": round((socket_diagnostics["successful_deliveries"] / (socket_diagnostics["successful_deliveries"] + max(1, socket_diagnostics["failed_connections"])) * 100), 2)
        }
    })


# --- MQTT Background Loop ---
def run_mqtt_listener():
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        print("paho-mqtt not installed. Skipping MQTT broker thread.")
        return
        
    broker_host = os.getenv("MQTT_BROKER", "broker.hivemq.com")
    broker_port = int(os.getenv("MQTT_PORT", 1883))
    
    client_id = f"aapadbandhav_server_{random.randint(1000, 9999)}"
    client = mqtt.Client(client_id=client_id, callback_api_version=mqtt.CallbackAPIVersion.VERSION1)
    
    global mqtt_client
    mqtt_client = client

    mqtt_user = os.getenv("MQTT_USER")
    mqtt_password = os.getenv("MQTT_PASSWORD")
    if mqtt_user and mqtt_password:
        client.username_pw_set(mqtt_user, mqtt_password)
        print("MQTT client credentials configured.")
    
    def on_connect(client, userdata, flags, rc):
        print(f"Connected to MQTT broker {broker_host}:{broker_port} with result code {rc}")
        client.subscribe("vehicle/+/FB")
        client.subscribe("vehicle/+/RB")
        client.subscribe("vehicle/+/FL")
        client.subscribe("vehicle/+/FR")
        client.subscribe("vehicle/+/RL")
        client.subscribe("vehicle/+/RR")
        client.subscribe("vehicle/+/L")
        client.subscribe("vehicle/+/R")
        
        client.subscribe("aapadbandhav/device/status")
        client.subscribe("aapadbandhav/device/heartbeat")
        client.subscribe("aapadbandhav/device/location")
        client.subscribe("aapadbandhav/device/accident")
        client.subscribe("aapadbandhav/device/speed")
        client.subscribe("aapadbandhav/device/node")
        
    def on_message(client, userdata, msg):
        topic = msg.topic
        payload_str = ""
        try:
            payload_str = msg.payload.decode('utf-8')
        except Exception:
            return
            
        db = SessionLocal()
        try:
            event_log = MQTTEvent(
                topic=topic,
                payload=payload_str,
                processed=True
            )
            db.add(event_log)
            db.commit()
            
            topic_parts = topic.split("/")
            if len(topic_parts) == 3 and topic_parts[0] == "vehicle":
                device_code = topic_parts[1]
                node_id = topic_parts[2]
                
                data = json.loads(payload_str)
                lat = data.get("latitude")
                lng = data.get("longitude")
                speed = data.get("speed", 0.0)
                impact_value = data.get("impactValue", 0.0)
                sensor_status = data.get("sensorStatus", "active")
                battery_status = data.get("batteryStatus", 100.0)
                
                device = db.query(Device).filter(Device.device_id == device_code).first()
                if device:
                    node = db.query(IoTNode).filter(
                        IoTNode.device_id == device.id,
                        IoTNode.node_id == node_id
                    ).first()
                    
                    if not node:
                        node = IoTNode(
                            device_id=device.id,
                            node_id=node_id
                        )
                        db.add(node)
                        
                    node.latitude = lat
                    node.longitude = lng
                    node.speed = float(speed) if speed is not None else 0.0
                    node.impact_value = float(impact_value) if impact_value is not None else 0.0
                    node.sensor_status = sensor_status
                    node.battery_status = float(battery_status) if battery_status is not None else 100.0
                    node.last_seen = datetime.datetime.utcnow()
                    db.commit()
                    
                    if lat is not None and lng is not None:
                        speed_val = process_gps_speed_and_logs(db, device.device_id, lat, lng)
                        check_and_update_device_stops(db, device, lat, lng, speed_val)
                        
                    # Accident Detection Logic
                    if impact_value >= 3.0:
                        five_seconds_ago = datetime.datetime.utcnow() - datetime.timedelta(seconds=5)
                        other_impacts = db.query(IoTNode).filter(
                            IoTNode.device_id == device.id,
                            IoTNode.impact_value >= 3.0,
                            IoTNode.last_seen >= five_seconds_ago,
                            IoTNode.node_id != node_id
                        ).all()
                        
                        severity = "medium"
                        desc = f"Single node collision detected at {node_id} with impact {impact_value}G."
                        
                        if other_impacts:
                            severity = "critical"
                            impact_nodes = [node_id] + [n.node_id for n in other_impacts]
                            desc = f"Multi-node collision detected at {', '.join(impact_nodes)} with impacts up to {max([impact_value] + [n.impact_value for n in other_impacts])}G."
                        elif impact_value >= 7.0:
                            severity = "high"
                            desc = f"High severity single node impact at {node_id} with impact {impact_value}G."
                            
                        if device.owner_id:
                            owner = db.query(User).filter(User.id == device.owner_id).first()
                            if owner:
                                active_accident = db.query(Accident).filter(
                                    Accident.user_id == owner.id,
                                    Accident.status.in_(['active', 'dispatched', 'responded']),
                                    Accident.created_at >= (datetime.datetime.utcnow() - datetime.timedelta(minutes=5))
                                ).first()
                                
                                if not active_accident:
                                    import random
                                    code = f"ACC-{random.randint(100000, 999999)}"
                                    
                                    new_acc = Accident(
                                        accident_code=code,
                                        user_id=owner.id,
                                        device_id=device.id,
                                        vehicle_number=owner.vehicle_number,
                                        vehicle_type=owner.vehicle_type,
                                        latitude=lat or 0.0,
                                        longitude=lng or 0.0,
                                        severity=severity,
                                        description=desc,
                                        speed_at_impact=float(speed) if speed is not None else 0.0,
                                        location_address=f"{round(float(lat), 5)}°N, {round(float(lng), 5)}°E" if lat else "Unknown GPS",
                                        status="active"
                                    )
                                    db.add(new_acc)
                                    db.commit()
                                    
                                    # Trigger Dispatch Pipeline
                                    Thread(target=dispatch_emergency_response_bg, args=(new_acc.id,)).start()
                                    
        except Exception as e:
            db.rollback()
            print(f"Error processing MQTT message: {e}")
        finally:
            db.close()
            
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        client.connect(broker_host, broker_port, 60)
        client.loop_forever()
    except Exception as e:
        print(f"MQTT client connection failed: {e}")

# Start MQTT daemon thread on server startup
try:
    Thread(target=run_mqtt_listener, daemon=True).start()
    print("🚀 MQTT Broker Listener thread initialized successfully.")
except Exception as e:
    print(f"❌ Failed to start MQTT Broker Listener thread: {e}")

if __name__ == '__main__':
    PORT = int(os.getenv("PORT", 5000))
    print(f"AapadBandhav Python API running on port {PORT} [flask-socketio]")
    socketio.run(app, host='0.0.0.0', port=PORT, debug=False, allow_unsafe_werkzeug=True)
