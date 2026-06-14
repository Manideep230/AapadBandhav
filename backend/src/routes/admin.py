import datetime
from flask import Blueprint, request, jsonify, g
from src.repositories.repos import DeviceRepository, AuditLogRepository, UserRepository, VehicleRepository, DeviceShareRepository
from src.services.services import DeviceService
from src.utils.auth_helpers import authenticate_jwt, require_admin_role

admin_bp = Blueprint('admin_bp', __name__)
from src.config.db import get_db

@admin_bp.route('/api/admin/devices/bulk', methods=['POST'])
@authenticate_jwt
@require_admin_role
def admin_bulk_device_generation():
    data = request.json or {}
    count = data.get("count")
    if not count or not isinstance(count, int) or count <= 0:
        return jsonify({"success": False, "message": "Count must be a positive integer"}), 422
        
    db = get_db()
    device_repo = DeviceRepository(db)
    vehicle_repo = VehicleRepository(db)
    share_repo = DeviceShareRepository(db)
    user_repo = UserRepository(db)
    audit_repo = AuditLogRepository(db)
    
    device_service = DeviceService(device_repo, vehicle_repo, share_repo, user_repo)
    
    try:
        devices = device_service.bulk_generate(count)
        audit_repo.log('admin', 'admin-001', 'generate_device', f"Generated {count} devices in bulk")
        return jsonify({
            "success": True,
            "message": f"Successfully generated {count} devices in bulk",
            "devices": devices
        }), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@admin_bp.route('/api/admin/devices/inventory', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_devices_inventory():
    search = (request.args.get("search") or "").strip()
    status = request.args.get("status")
    
    db = get_db()
    device_repo = DeviceRepository(db)
    
    try:
        devices = device_repo.get_unassigned_inventory(search, status)
        return jsonify({
            "success": True,
            "devices": [d.to_json() for d in devices]
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@admin_bp.route('/api/admin/devices/assigned', methods=['GET'])
@authenticate_jwt
@require_admin_role
def admin_devices_assigned():
    search = (request.args.get("search") or "").strip()
    
    db = get_db()
    device_repo = DeviceRepository(db)
    
    try:
        devices = device_repo.get_assigned_devices(search)
        return jsonify({
            "success": True,
            "devices": devices
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@admin_bp.route('/api/admin/devices/<id>/status', methods=['PUT'])
@authenticate_jwt
@require_admin_role
def admin_toggle_device_status(id):
    data = request.json or {}
    status = data.get("status")
    
    if status not in ['active', 'inactive']:
        return jsonify({"success": False, "message": "Status must be 'active' or 'inactive'"}), 422
        
    db = get_db()
    device_repo = DeviceRepository(db)
    audit_repo = AuditLogRepository(db)
    
    device = device_repo.get_by_id(id)
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    try:
        device.status = status
        device.is_active = (status == 'active')
        db.commit()
        
        audit_repo.log('admin', 'admin-001', 'toggle_device_status', f"Changed status of device {device.device_id} to {status}")
        return jsonify({
            "success": True,
            "message": f"Device status set to {status}",
            "device": device.to_json()
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@admin_bp.route('/api/admin/devices/<id>', methods=['DELETE'])
@authenticate_jwt
@require_admin_role
def admin_delete_device(id):
    db = get_db()
    device_repo = DeviceRepository(db)
    audit_repo = AuditLogRepository(db)
    
    device = device_repo.get_by_id(id)
    if not device:
        return jsonify({"success": False, "message": "Device not found"}), 404
        
    if device.is_linked:
        return jsonify({"success": False, "message": "Cannot delete a linked device. Unlink it first."}), 400
        
    try:
        dev_code = device.device_id
        device_repo.delete(device)
        audit_repo.log('admin', 'admin-001', 'delete_device', f"Deleted device {dev_code}")
        return jsonify({
            "success": True,
            "message": "Device deleted successfully"
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
