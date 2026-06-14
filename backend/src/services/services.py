import os
import random
import string
import datetime
import bcrypt
import jwt
import hashlib
import json
import requests
from urllib3.exceptions import InsecureRequestWarning
from sqlalchemy import desc

# Disable request SSL warnings specifically for IP SMS Gateway
requests.packages.urllib3.disable_warnings(category=InsecureRequestWarning)

# ─── Crypto Helpers ───────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def check_password(password: str, hashed: str) -> bool:
    if not password or not hashed:
        return False
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def sha256_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

# ─── JWT Token ────────────────────────────────────────────────────────────────

def generate_token(payload: dict) -> str:
    payload_copy = payload.copy()
    payload_copy['exp'] = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    payload_copy['iat'] = datetime.datetime.utcnow()
    secret = os.getenv("JWT_SECRET", "change_this_to_a_minimum_64_char_random_secret_in_production")
    return jwt.encode(payload_copy, secret, algorithm='HS256')

# ─── SMS Gateway ──────────────────────────────────────────────────────────────

def send_sms_gateway(mobile, message_body, db_session, accident_id=None):
    from src.models.models import EmergencyContact, EmergencySMSLog

    secret = os.getenv("SMS_SECRET", "dummy_secret")
    sender = os.getenv("SMS_SENDER", "AapadB")
    tempid = os.getenv("SMS_TEMPID", "dummy_temp_id")
    route = os.getenv("SMS_ROUTE", "dummy_route")
    msgtype = os.getenv("SMS_MSGTYPE", "text")
    url = "https://43.252.88.250/index.php/smsapi/httpapi/"

    sms_log = None
    if accident_id:
        contact = db_session.query(EmergencyContact).filter(EmergencyContact.mobile == mobile).first()
        contact_name = contact.contact_name if contact else "Emergency Contact"
        sms_log = EmergencySMSLog(
            accident_id=accident_id,
            recipient_name=contact_name,
            recipient_mobile=mobile,
            message=message_body,
            status='sending',
            attempts=0
        )
        db_session.add(sms_log)
        db_session.commit()

    success = False
    attempts = 0
    error_msg = None

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
        db_session.add(sms_log)
        db_session.commit()

    return success

# ─── Haversine Distance ───────────────────────────────────────────────────────

def haversine_distance(lat1, lon1, lat2, lon2):
    import math
    R = 6371.0
    dlat = (lat2 - lat1) * (math.pi / 180.0)
    dlon = (lon2 - lon1) * (math.pi / 180.0)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1 * math.pi / 180.0) * math.cos(lat2 * math.pi / 180.0) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ─── GPS Speed Processing ────────────────────────────────────────────────────

def process_gps_speed_and_logs(db_session, device_code, lat, lng, recorded_at=None):
    from src.models.models import Device, GPSSpeedLog
    if not recorded_at:
        recorded_at = datetime.datetime.utcnow()
    device = db_session.query(Device).filter(Device.owner_id == device_code, Device.is_linked == True).first()
    if not device:
        device = db_session.query(Device).filter(Device.device_id == device_code).first()
    if not device:
        return 0.0

    last_log = db_session.query(GPSSpeedLog).filter(
        GPSSpeedLog.device_id == device.id
    ).order_by(desc(GPSSpeedLog.timestamp)).first()

    speed = 0.0
    if last_log:
        dist = haversine_distance(float(last_log.latitude), float(last_log.longitude), float(lat), float(lng))
        time_diff = (recorded_at - last_log.timestamp).total_seconds()
        if time_diff > 0:
            speed = dist / (time_diff / 3600.0)
            if speed > 220.0:
                speed = 220.0

    speed_log = GPSSpeedLog(
        device_id=device.id,
        latitude=lat,
        longitude=lng,
        speed=speed,
        timestamp=recorded_at
    )
    db_session.add(speed_log)
    db_session.flush()

    speed_logs = db_session.query(GPSSpeedLog).filter(GPSSpeedLog.device_id == device.id).all()
    speeds = [float(log.speed) for log in speed_logs if log.speed is not None]

    if speeds:
        avg_speed = round(sum(speeds) / len(speeds), 2)
        max_speed = round(max(speeds), 2)
    else:
        avg_speed = 0.0
        max_speed = 0.0

    device.current_speed = round(speed, 2)
    device.average_speed = avg_speed
    device.peak_speed = max_speed
    db_session.add(device)
    db_session.commit()

    return round(speed, 2)

# ─── Multi-Entity Mobile Lookup ──────────────────────────────────────────────

# Response key mapping for each role
ROLE_RESPONSE_KEY = {
    "hospital": "hospital",
    "ambulance": "driver",
    "police_station": "station",
    "policeman": "policeman",
    "mechanic": "mechanic",
    "insurance": "company",
    "user": "user",
    "admin": "user",
    "superadmin": "user",
    "volunteer": "user",
    "fire_department": "user",
    "emergency_personnel": "user",
}

def find_entity_by_mobile(db, mobile, preferred_role=None):
    """
    Search for an entity across all tables by mobile number.
    Checks admin mobile first (from ADMIN_MOBILE env var).
    If preferred_role is given, that table is searched first.
    Returns (entity, role) or (None, None).
    """
    import os
    from src.models.models import (
        User, Hospital, AmbulanceDriver, PoliceStation, Policeman, Mechanic, InsuranceCompany
    )

    # ─── Admin check first (highest priority) ────────────────────────────────
    admin_mobile = os.getenv("ADMIN_MOBILE", "9999999999")
    if str(mobile).strip() == str(admin_mobile).strip():
        # Return a lightweight synthetic admin object
        class AdminEntity:
            id = "admin-001"
            role = "superadmin"
            mobile = admin_mobile
            full_name = "System Administrator"
            is_active = True
            mobile_verified = True
            permissions = [
                "manage_users", "manage_devices", "manage_vehicles",
                "manage_police", "manage_reports", "manage_documentation"
            ]
            created_by = "system"

            def to_safe_json(self):
                return {
                    "id": self.id,
                    "role": self.role,
                    "mobile": self.mobile,
                    "full_name": self.full_name,
                    "is_active": self.is_active,
                    "permissions": self.permissions,
                    "created_by": self.created_by
                }
        return AdminEntity(), "superadmin"

    role_map = [
        ("user", User),
        ("hospital", Hospital),
        ("ambulance", AmbulanceDriver),
        ("police_station", PoliceStation),
        ("policeman", Policeman),
        ("mechanic", Mechanic),
        ("insurance", InsuranceCompany),
    ]

    # If a role preference is given, reorder to check that role first
    if preferred_role and preferred_role not in ("user", "admin"):
        role_map = sorted(role_map, key=lambda x: 0 if x[0] == preferred_role else 1)

    for role, model_cls in role_map:
        entity = db.query(model_cls).filter(model_cls.mobile == mobile).first()
        if entity:
            actual_role = entity.role if role == "user" and hasattr(entity, "role") else role
            return entity, actual_role

    return None, None


def find_all_roles_by_mobile(db, mobile):
    """
    Find all roles associated with a mobile number across all tables.
    Returns a list of roles (strings).
    """
    import os
    from src.models.models import (
        User, Hospital, AmbulanceDriver, PoliceStation, Policeman, Mechanic, InsuranceCompany
    )

    roles = []

    # 1. Check superadmin
    admin_mobile = os.getenv("ADMIN_MOBILE", "9999999999")
    if str(mobile).strip() == str(admin_mobile).strip():
        roles.append("superadmin")

    # 2. Check User table
    u = db.query(User).filter(User.mobile == mobile).first()
    if u:
        roles.append(u.role or "user")

    # 3. Check other tables
    if db.query(Hospital).filter(Hospital.mobile == mobile).first():
        roles.append("hospital")
    if db.query(AmbulanceDriver).filter(AmbulanceDriver.mobile == mobile).first():
        roles.append("ambulance")
    if db.query(PoliceStation).filter(PoliceStation.mobile == mobile).first():
        roles.append("police_station")
    if db.query(Policeman).filter(Policeman.mobile == mobile).first():
        roles.append("policeman")
    if db.query(Mechanic).filter(Mechanic.mobile == mobile).first():
        roles.append("mechanic")
    if db.query(InsuranceCompany).filter(InsuranceCompany.mobile == mobile).first():
        roles.append("insurance")

    # Deduplicate while preserving order/uniqueness
    return list(dict.fromkeys(roles))


def is_mobile_registered(db, mobile):
    """Check if mobile is registered — excludes admin mobile (admin can't self-register)."""
    import os
    admin_mobile = os.getenv("ADMIN_MOBILE", "9999999999")
    if str(mobile).strip() == str(admin_mobile).strip():
        return True  # Treat admin mobile as already reserved
    entity, _ = find_entity_by_mobile(db, mobile)
    return entity is not None

# ─── Auth Service ─────────────────────────────────────────────────────────────

class AuthService:
    def __init__(self, user_repo, otp_repo):
        self.user_repo = user_repo
        self.otp_repo = otp_repo

    def send_otp(self, mobile, db_session):
        """Generate and dispatch a 6-digit OTP to the given mobile number."""
        otp = "".join([str(random.randint(0, 9)) for _ in range(6)])
        otp_hash = sha256_hash(otp)
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=5)

        from src.models.models import OTPVerification
        verification = OTPVerification(
            mobile=mobile,
            otp_hash=otp_hash,
            expires_at=expires_at,
            attempts=0,
            verified=False
        )
        db_session.add(verification)
        db_session.commit()

        # format message body
        msg = (
            "AapadBandhav Verification Code\n\n"
            f"Your OTP is: {otp}\n"
            "This code is valid for 5 minutes. Do not share it.\n\n"
            "Thank You,\n"
            "Team NighaTech Global Pvt Ltd"
        )
        send_sms_gateway(mobile, msg, db_session)
        return otp

    def verify_otp(self, mobile, otp, preferred_role=None):
        """
        Verify OTP for mobile number and return a JWT token.
        preferred_role: hint for which entity table to look in first.
        
        Rules:
        - End users (role=user/None): if not found, return is_new_user=True to trigger registration.
        - Service accounts (hospital, ambulance, etc.): if not found, raise an error.
          Service accounts can ONLY be created by an administrator.
        """
        verification = self.otp_repo.find_active_verification(mobile)
        if not verification:
            raise ValueError("OTP expired or not requested. Please request a new OTP.")

        if verification.attempts >= 5:
            raise ValueError("Maximum verification attempts exceeded. Please request a new OTP.")

        verification.attempts += 1
        self.otp_repo.commit()

        expected_hash = sha256_hash(otp)
        if verification.otp_hash != expected_hash:
            raise ValueError("Invalid OTP. Please check and try again.")

        verification.verified = True
        self.otp_repo.commit()

        db = self.user_repo.db
        matched_roles = find_all_roles_by_mobile(db, mobile)

        if not matched_roles:
            # Service portals cannot self-register — only admin can create them
            SERVICE_ROLES = {'hospital', 'ambulance', 'police_station', 'policeman', 'mechanic', 'insurance', 'fire_department', 'volunteer', 'emergency_personnel'}
            if preferred_role and preferred_role in SERVICE_ROLES:
                raise ValueError(
                    f"Mobile number is not registered for this portal. "
                    f"Please contact the administrator to create your {preferred_role.replace('_', ' ')} account."
                )
            # End-users: redirect to registration page
            return {"success": True, "is_new_user": True, "mobile": mobile}

        # Multi-role logic: if user matches multiple roles, and no role has been chosen yet (or preferred_role is invalid/not matched)
        if len(matched_roles) > 1 and (not preferred_role or preferred_role not in matched_roles):
            # Do NOT consume OTP yet (reset verified flag so they can select a role and verify again)
            verification.verified = False
            self.otp_repo.commit()
            return {
                "success": True,
                "needs_role_selection": True,
                "roles": matched_roles,
                "mobile": mobile
            }

        # Choose the single matched role, or the selected role
        selected_role = preferred_role if preferred_role in matched_roles else matched_roles[0]
        entity, role = find_entity_by_mobile(db, mobile, preferred_role=selected_role)

        # Activate account on first successful OTP login (admin-created accounts)
        if hasattr(entity, 'mobile_verified') and not entity.mobile_verified:
            entity.mobile_verified = True
            entity.is_active = True
            db.add(entity)
            db.commit()

        if hasattr(entity, 'is_active') and entity.is_active is not None and not entity.is_active:
            raise PermissionError("Your account has been deactivated. Contact the administrator.")

        if hasattr(entity, 'last_login'):
            entity.last_login = datetime.datetime.utcnow()
            db.add(entity)
            db.commit()

        token = generate_token({"id": entity.id, "role": role})
        res_key = ROLE_RESPONSE_KEY.get(role, "user")

        return {
            "success": True,
            "token": token,
            res_key: entity.to_safe_json() if hasattr(entity, 'to_safe_json') else entity.to_json(),
            "entityType": role,
        }

    def register_user_otp(
        self, full_name, mobile, otp,
        email=None, age=None, gender="Prefer not to say",
        blood_group="Unknown", address=None
    ):
        """Register a new citizen user after OTP verification."""
        verification = self.otp_repo.find_active_verification(mobile)
        if not verification:
            raise ValueError("OTP expired or not requested. Please request a new OTP.")

        if verification.attempts >= 5:
            raise ValueError("Maximum verification attempts exceeded.")

        verification.attempts += 1
        self.otp_repo.commit()

        expected_hash = sha256_hash(otp)
        if verification.otp_hash != expected_hash:
            raise ValueError("Invalid OTP.")

        verification.verified = True
        self.otp_repo.commit()

        db = self.user_repo.db
        if is_mobile_registered(db, mobile):
            raise ValueError("Mobile number is already registered. Please sign in instead.")

        # Generate unique AapadBandhav user ID (AB followed by 6 digits)
        unique_id = ""
        while True:
            rest = "".join([str(random.randint(0, 9)) for _ in range(6)])
            unique_id = "AB" + rest
            if not self.user_repo.get_by_unique_id(unique_id):
                break

        from src.models.models import User
        user = User(
            unique_id=unique_id,
            full_name=full_name,
            email=email,
            mobile=mobile,
            password=None,
            address=address,
            blood_group=blood_group,
            age=age,
            gender=gender,
            role="user",
            is_active=True,
            mobile_verified=True,
        )
        self.user_repo.add(user)
        self.user_repo.commit()

        token = generate_token({"id": user.id, "role": "user"})
        return {
            "success": True,
            "token": token,
            "user": user.to_safe_json(),
            "entityType": "user",
        }

# ─── Device Service ───────────────────────────────────────────────────────────

class DeviceService:
    def __init__(self, device_repo, vehicle_repo, share_repo, user_repo):
        self.device_repo = device_repo
        self.vehicle_repo = vehicle_repo
        self.share_repo = share_repo
        self.user_repo = user_repo

    def bulk_generate(self, count):
        from src.models.models import Device
        generated = []
        for _ in range(count):
            while True:
                dev_code = "".join([str(random.randint(0, 9)) for _ in range(16)])
                if not self.device_repo.get_by_device_id(dev_code):
                    break

            while True:
                pass_name = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
                if not self.device_repo.db.query(Device).filter(Device.pass_name == pass_name).first():
                    break

            pass_code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))

            while True:
                sim_code = "".join([str(random.randint(0, 9)) for _ in range(13)])
                if not self.device_repo.db.query(Device).filter(Device.sim_code == sim_code).first():
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
            self.device_repo.add(device)
            self.device_repo.commit()
            generated.append(device.to_json())

        return generated

    def register_qr_device(self, user_id, qr_data):
        if isinstance(qr_data, str):
            device_code = qr_data.strip()
            vehicle_type = "Car"
            vehicle_number = None
            vehicle_model = None
            manufacturer = None
            year = None
        else:
            device_code = qr_data.get("deviceCode")
            vehicle_type = qr_data.get("vehicle_type", "Car")
            vehicle_number = qr_data.get("vehicle_number")
            vehicle_model = qr_data.get("vehicle_model")
            manufacturer = qr_data.get("manufacturer")
            year = qr_data.get("year")

        if not device_code:
            raise ValueError("Device code is required")
        if not vehicle_number:
            raise ValueError("Vehicle number is required")

        device_code = str(device_code).strip().replace('"', '').replace("'", "")
        device = self.device_repo.get_by_device_id(device_code)
        if not device:
            raise ValueError("Device verification failed. Invalid 16-digit device code.")

        if device.is_linked:
            raise ValueError("This device is already linked to another user.")

        device.owner_id = user_id
        device.is_linked = True
        device.linked_at = datetime.datetime.utcnow()
        device.status = "active"
        device.is_active = True
        self.device_repo.commit()

        from src.models.models import VehicleInformation
        vehicle = VehicleInformation(
            user_id=user_id,
            device_id=device.id,
            vehicle_type=vehicle_type,
            vehicle_number=vehicle_number,
            vehicle_model=vehicle_model,
            manufacturer=manufacturer,
            year=int(year) if year else None
        )
        self.vehicle_repo.add(vehicle)
        self.vehicle_repo.commit()

        user = self.user_repo.get_by_id(user_id)
        if user:
            user.vehicle_number = vehicle_number
            user.vehicle_type = vehicle_type
            self.user_repo.commit()

        return {"device": device.to_json(), "vehicle": vehicle.to_json()}
