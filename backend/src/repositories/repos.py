import datetime
from sqlalchemy import or_, and_, desc
from src.models.models import (
    User, Device, OTPVerification, VehicleInformation, DeviceShare,
    IoTNode, GPSSpeedLog, EmergencySMSLog, AuditLog, Alert, Notification,
    LiveLocation, Route, Acknowledgement
)

class BaseRepository:
    def __init__(self, db_session):
        self.db = db_session

    def add(self, entity):
        self.db.add(entity)
        return entity

    def commit(self):
        self.db.commit()

    def flush(self):
        self.db.flush()

    def delete(self, entity):
        self.db.delete(entity)
        self.db.commit()

class UserRepository(BaseRepository):
    def get_by_id(self, user_id):
        return self.db.query(User).filter(User.id == user_id).first()

    def get_by_unique_id(self, unique_id):
        return self.db.query(User).filter(User.unique_id == unique_id).first()

    def get_by_mobile(self, mobile):
        return self.db.query(User).filter(User.mobile == mobile).first()

    def get_by_email(self, email):
        return self.db.query(User).filter(User.email == email).first()

    def query_users(self, search="", role="user", limit=100):
        query = self.db.query(User).filter(User.role == role)
        if search:
            query = query.filter(or_(
                User.full_name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.mobile.ilike(f"%{search}%"),
                User.unique_id.ilike(f"%{search}%")
            ))
        return query.limit(limit).all()

class DeviceRepository(BaseRepository):
    def get_by_id(self, device_db_id):
        return self.db.query(Device).filter(Device.id == device_db_id).first()

    def get_by_device_id(self, device_id):
        return self.db.query(Device).filter(Device.device_id == device_id).first()

    def get_by_credentials(self, device_id, pass_name, pass_code, sim_code):
        return self.db.query(Device).filter(
            Device.device_id == device_id,
            Device.pass_name == pass_name,
            Device.pass_code == pass_code,
            Device.sim_code == sim_code
        ).first()

    def get_owned_devices(self, owner_id):
        return self.db.query(Device).filter(
            Device.owner_id == owner_id,
            Device.is_linked == True
        ).all()

    def get_unassigned_inventory(self, search="", status="all"):
        query = self.db.query(Device).filter(Device.is_linked == False)
        if status and status != 'all':
            query = query.filter(Device.status == status)
        devices = query.all()
        if search:
            search_lower = search.lower()
            devices = [
                d for d in devices
                if search_lower in d.device_id.lower()
                or (d.pass_name and search_lower in d.pass_name.lower())
                or (d.sim_code and search_lower in d.sim_code.lower())
            ]
        return devices

    def get_assigned_devices(self, search=""):
        devices = self.db.query(Device).filter(Device.is_linked == True).all()
        assigned = []
        for d in devices:
            user = self.db.query(User).filter(User.id == d.owner_id).first()
            vehicle = self.db.query(VehicleInformation).filter(VehicleInformation.device_id == d.id).first()
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
                s_lower = search.lower()
                if (s_lower in item["deviceCode"].lower() or
                    (item["passName"] and s_lower in item["passName"].lower()) or
                    (item["simCode"] and s_lower in item["simCode"].lower()) or
                    s_lower in item["userName"].lower() or
                    s_lower in item["mobile"].lower()):
                    assigned.append(item)
            else:
                assigned.append(item)
        return assigned

class VehicleRepository(BaseRepository):
    def get_by_device_id(self, device_db_id):
        return self.db.query(VehicleInformation).filter(VehicleInformation.device_id == device_db_id).first()

    def delete_by_device_id(self, device_db_id):
        self.db.query(VehicleInformation).filter(VehicleInformation.device_id == device_db_id).delete()
        self.db.commit()

class DeviceShareRepository(BaseRepository):
    def get_shares_for_user(self, user_id):
        return self.db.query(DeviceShare).filter(DeviceShare.user_id == user_id).all()

    def get_shares_for_device(self, device_db_id):
        return self.db.query(DeviceShare).filter(DeviceShare.device_id == device_db_id).all()

    def get_by_user_and_device(self, user_id, device_db_id):
        return self.db.query(DeviceShare).filter(
            DeviceShare.device_id == device_db_id,
            DeviceShare.user_id == user_id
        ).first()

    def delete_shares_for_device(self, device_db_id):
        self.db.query(DeviceShare).filter(DeviceShare.device_id == device_db_id).delete()
        self.db.commit()

class OTPRepository(BaseRepository):
    def find_active_verification(self, mobile):
        return self.db.query(OTPVerification).filter(
            OTPVerification.mobile == mobile,
            OTPVerification.expires_at > datetime.datetime.utcnow()
        ).order_by(desc(OTPVerification.created_at)).first()

class IoTNodeRepository(BaseRepository):
    def get_by_device_and_node(self, device_db_id, node_id):
        return self.db.query(IoTNode).filter(
            IoTNode.device_id == device_db_id,
            IoTNode.node_id == node_id
        ).first()

    def get_other_recent_impacts(self, device_db_id, node_id, threshold=3.0, seconds_limit=5):
        since_time = datetime.datetime.utcnow() - datetime.timedelta(seconds=seconds_limit)
        return self.db.query(IoTNode).filter(
            IoTNode.device_id == device_db_id,
            IoTNode.impact_value >= threshold,
            IoTNode.last_seen >= since_time,
            IoTNode.node_id != node_id
        ).all()

class GPSSpeedLogRepository(BaseRepository):
    def get_last_log(self, device_db_id):
        return self.db.query(GPSSpeedLog).filter(
            GPSSpeedLog.device_id == device_db_id
        ).order_by(desc(GPSSpeedLog.timestamp)).first()

    def get_all_for_device(self, device_db_id):
        return self.db.query(GPSSpeedLog).filter(GPSSpeedLog.device_id == device_db_id).all()

    def delete_by_device_id(self, device_db_id):
        self.db.query(GPSSpeedLog).filter(GPSSpeedLog.device_id == device_db_id).delete()
        self.db.commit()

class AccidentRepository(BaseRepository):
    def get_by_id(self, accident_id):
        return self.db.query(Accident).filter(Accident.id == accident_id).first()

    def get_active_accident(self, user_id, minutes_limit=5):
        since_time = datetime.datetime.utcnow() - datetime.timedelta(minutes=minutes_limit)
        return self.db.query(Accident).filter(
            Accident.user_id == user_id,
            Accident.status.in_(['active', 'dispatched', 'responded']),
            Accident.created_at >= since_time
        ).first()

    def get_all_accidents(self, limit=100):
        return self.db.query(Accident).order_by(desc(Accident.created_at)).limit(limit).all()

class EmergencySMSLogRepository(BaseRepository):
    pass

class AuditLogRepository(BaseRepository):
    def log(self, entity_type, entity_id, action, details=""):
        audit = AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            details=details
        )
        self.db.add(audit)
        self.db.commit()
        return audit
