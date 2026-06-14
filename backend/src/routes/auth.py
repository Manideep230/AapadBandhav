import os
import datetime
from flask import Blueprint, request, jsonify, g
from src.config.db import DB_DIALECT, get_db
from src.repositories.repos import UserRepository, OTPRepository, AuditLogRepository
from src.services.services import AuthService

auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/api/auth/otp/send', methods=['POST'])
def send_otp_api():
    data = request.json or {}
    mobile = data.get("mobile")
    if not mobile:
        return jsonify({"success": False, "message": "Mobile number is required"}), 422
        
    db = get_db()
    user_repo = UserRepository(db)
    otp_repo = OTPRepository(db)
    auth_service = AuthService(user_repo, otp_repo)
    
    # Rate limiting: Resend OTP after 30 seconds (bypassed in testing)
    from flask import current_app
    last_verification = otp_repo.find_active_verification(mobile)
    if last_verification and not current_app.config.get('TESTING'):
        time_elapsed = (datetime.datetime.utcnow() - last_verification.created_at).total_seconds()
        if time_elapsed < 30:
            return jsonify({
                "success": False, 
                "message": f"Please wait {int(30 - time_elapsed)} seconds before requesting a new OTP."
            }), 429
            
    try:
        otp = auth_service.send_otp(mobile, db)
        print(f"🔑 [OTP] Mobile: {mobile} | OTP: {otp} | NODE_ENV: {os.getenv('NODE_ENV', 'development')}")
        return jsonify({
            "success": True,
            "message": "OTP sent successfully",
            "otp": otp  # Always return OTP so login works regardless of SMS delivery
        })
    except Exception as e:
        print(f"❌ [OTP Send Error] Mobile: {mobile} | Error: {e}")
        return jsonify({"success": False, "message": str(e)}), 400

@auth_bp.route('/api/auth/otp/verify', methods=['POST'])
def verify_otp_api():
    data = request.json or {}
    mobile = data.get("mobile")
    otp = data.get("otp")
    role = data.get("role")  # Optional role hint for entity lookup
    
    if not mobile or not otp:
        return jsonify({"success": False, "message": "Mobile number and OTP are required"}), 422
        
    db = get_db()
    user_repo = UserRepository(db)
    otp_repo = OTPRepository(db)
    audit_repo = AuditLogRepository(db)
    auth_service = AuthService(user_repo, otp_repo)
    
    try:
        res = auth_service.verify_otp(mobile, otp, preferred_role=role)
        if not res.get("is_new_user") and res.get("success"):
            entity_type = res.get("entityType", "user")
            from src.services.services import ROLE_RESPONSE_KEY
            data_key = ROLE_RESPONSE_KEY.get(entity_type, "user")
            entity_data = res.get(data_key) or {}
            entity_id = entity_data.get("id", "unknown")
            audit_repo.log(entity_type, entity_id, 'login', f"Logged in via OTP mobile {mobile}")
        return jsonify(res)
    except ValueError as e:
        return jsonify({"success": False, "message": str(e)}), 400
    except PermissionError as e:
        return jsonify({"success": False, "message": str(e)}), 403
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@auth_bp.route('/api/auth/otp/register', methods=['POST'])
def otp_register_api():
    data = request.json or {}
    full_name = data.get("full_name")
    mobile = data.get("mobile")
    otp = data.get("otp")
    
    if not full_name or not mobile or not otp:
        return jsonify({"success": False, "message": "Name, mobile, and OTP are required"}), 422
        
    db = get_db()
    user_repo = UserRepository(db)
    otp_repo = OTPRepository(db)
    audit_repo = AuditLogRepository(db)
    auth_service = AuthService(user_repo, otp_repo)
    
    try:
        res = auth_service.register_user_otp(
            full_name=full_name,
            mobile=mobile,
            otp=otp,
            email=data.get("email"),
            age=data.get("age"),
            gender=data.get("gender", "Prefer not to say"),
            blood_group=data.get("blood_group", "Unknown"),
            address=data.get("address")
        )
        user_id = res["user"]["id"]
        audit_repo.log('user', user_id, 'register', f"Registered via OTP mobile {mobile}")
        return jsonify(res), 201
    except ValueError as e:
        if "already registered" in str(e):
            return jsonify({"success": False, "message": str(e)}), 409
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
