import datetime
from flask import Blueprint, request, jsonify, g
from src.repositories.repos import DeviceRepository, UserRepository, VehicleRepository, DeviceShareRepository, AuditLogRepository
from src.services.services import DeviceService
from src.utils.auth_helpers import authenticate_jwt, require_user_role

devices_bp = Blueprint('devices_bp', __name__)
from src.config.db import get_db

@devices_bp.route('/api/devices/register-qr', methods=['POST'])
@authenticate_jwt
@require_user_role
def register_device_qr():
    data = request.json or {}
    db = get_db()
    
    device_repo = DeviceRepository(db)
    vehicle_repo = VehicleRepository(db)
    share_repo = DeviceShareRepository(db)
    user_repo = UserRepository(db)
    audit_repo = AuditLogRepository(db)
    
    device_service = DeviceService(device_repo, vehicle_repo, share_repo, user_repo)
    
    try:
        res = device_service.register_qr_device(g.user.id, data)
        audit_repo.log('user', g.user.id, 'register_device', f"Linked device {data.get('deviceCode')} to vehicle {data.get('vehicle_number')}")
        return jsonify({
            "success": True,
            "message": "Device registered and vehicle details linked successfully",
            "device": res["device"],
            "vehicle": res["vehicle"]
        }), 201
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 422
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@devices_bp.route('/api/devices/my-devices', methods=['GET'])
@authenticate_jwt
@require_user_role
def get_my_devices():
    db = get_db()
    device_repo = DeviceRepository(db)
    vehicle_repo = VehicleRepository(db)
    share_repo = DeviceShareRepository(db)
    user_repo = UserRepository(db)
    
    try:
        owned_devices = device_repo.get_owned_devices(g.user.id)
        owned_list = []
        for d in owned_devices:
            vehicle = vehicle_repo.get_by_device_id(d.id)
            owned_list.append({
                "device": d.to_json(),
                "vehicle": vehicle.to_json() if vehicle else None,
                "role": "owner"
            })
            
        shares = share_repo.get_shares_for_user(g.user.id)
        shared_list = []
        for s in shares:
            d = device_repo.get_by_id(s.device_id)
            if d:
                vehicle = vehicle_repo.get_by_device_id(d.id)
                owner = user_repo.get_by_id(d.owner_id)
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
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@devices_bp.route('/api/devices/share', methods=['POST'])
@authenticate_jwt
@require_user_role
def share_device_access():
    data = request.json or {}
    device_id = data.get("device_id")
    share_with_unique_id = data.get("share_with_id")
    
    if not device_id or not share_with_unique_id:
        return jsonify({"success": False, "message": "device_id and share_with_id are required"}), 422
        
    db = get_db()
    device_repo = DeviceRepository(db)
    user_repo = UserRepository(db)
    share_repo = DeviceShareRepository(db)
    audit_repo = AuditLogRepository(db)
    
    device = device_repo.get_by_id(device_id)
    if not device or device.owner_id != g.user.id:
        return jsonify({"success": False, "message": "Device not found or access denied"}), 403
        
    target_user = user_repo.get_by_unique_id(share_with_unique_id)
    if not target_user or target_user.role != 'user':
        return jsonify({"success": False, "message": "User with this AapadBandhav ID not found"}), 404
        
    if target_user.id == g.user.id:
        return jsonify({"success": False, "message": "Cannot share device with yourself"}), 400
        
    existing = share_repo.get_by_user_and_device(target_user.id, device_id)
    if existing:
        return jsonify({"success": False, "message": "Device is already shared with this user"}), 409
        
    try:
        from src.models.models import DeviceShare
        share = DeviceShare(
            device_id=device_id,
            user_id=target_user.id,
            role='viewer'
        )
        share_repo.add(share)
        share_repo.commit()
        
        audit_repo.log('user', g.user.id, 'share_device', f"Shared device {device.device_id} with user {target_user.unique_id}")
        return jsonify({
            "success": True,
            "message": f"Successfully shared device with {target_user.full_name}",
            "share": share.to_json()
        }), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@devices_bp.route('/api/devices/unshare', methods=['POST'])
@authenticate_jwt
@require_user_role
def revoke_device_share():
    data = request.json or {}
    device_id = data.get("device_id")
    target_user_id = data.get("user_id")
    
    if not device_id or not target_user_id:
        return jsonify({"success": False, "message": "device_id and user_id are required"}), 422
        
    db = get_db()
    device_repo = DeviceRepository(db)
    share_repo = DeviceShareRepository(db)
    audit_repo = AuditLogRepository(db)
    
    device = device_repo.get_by_id(device_id)
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    if device.owner_id != g.user.id and target_user_id != g.user.id:
        return jsonify({"success": False, "message": "Access denied"}), 403
        
    share = share_repo.get_by_user_and_device(target_user_id, device_id)
    if not share:
        return jsonify({"success": False, "message": "No active share found for this device and user"}), 404
        
    try:
        share_repo.delete(share)
        audit_repo.log('user', g.user.id, 'unshare_device', f"Unshared device {device.device_id} from user {target_user_id}")
        return jsonify({
            "success": True,
            "message": "Device sharing access revoked successfully"
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@devices_bp.route('/api/devices/shares/<device_id>', methods=['GET'])
@authenticate_jwt
@require_user_role
def get_device_shares(device_id):
    db = get_db()
    device_repo = DeviceRepository(db)
    share_repo = DeviceShareRepository(db)
    user_repo = UserRepository(db)
    
    device = device_repo.get_by_id(device_id)
    if not device or device.owner_id != g.user.id:
        return jsonify({"success": False, "message": "Device not found or access denied"}), 403
        
    try:
        shares = share_repo.get_shares_for_device(device_id)
        result = []
        for s in shares:
            u = user_repo.get_by_id(s.user_id)
            if u:
                result.append({
                    "id": s.id,
                    "user_id": u.id,
                    "full_name": u.full_name,
                    "mobile": u.mobile,
                    "role": s.role
                })
        return jsonify({
            "success": True,
            "shares": result
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@devices_bp.route('/api/devices/locate', methods=['GET', 'POST'])
@devices_bp.route('/api/devices/locate/', methods=['GET', 'POST'])
@authenticate_jwt
@require_user_role
def locate_device_bp():
    from sqlalchemy import desc
    from src.models.models import Device, LiveLocation, DeviceShare
    
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

