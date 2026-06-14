"""
AapadBandhav - Comprehensive Test Suite
Tests all authentication, device, and admin flows under the
Mobile Number + OTP only authentication system.
"""
import json
import unittest
import os
import sys
import datetime
import random

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import (
    app, Base, engine, SessionLocal,
    User, Device, OTPVerification, VehicleInformation,
    DeviceShare, IoTNode, Hospital, AmbulanceDriver,
    PoliceStation, Policeman, Mechanic, InsuranceCompany,
    process_gps_speed_and_logs, generate_token
)

# ─── Helper ───────────────────────────────────────────────────────────────────

def _extract_otp(db, mobile):
    """Retrieve the latest OTP record from the database (development only)."""
    from app import OTPVerification, sha256_hash
    from sqlalchemy import desc
    rec = db.query(OTPVerification).filter(
        OTPVerification.mobile == mobile
    ).order_by(desc(OTPVerification.created_at)).first()
    return rec  # otp is stored as hash; actual raw OTP returned in response in dev mode

def _admin_token(client):
    """Obtain a valid admin JWT token."""
    res = client.post('/api/auth/admin/login', json={
        "email": os.getenv("ADMIN_EMAIL", "admin@aapadbandhav.in"),
        "password": os.getenv("ADMIN_PASSWORD", "Admin@2024")
    })
    return json.loads(res.data).get("token")

# ─── Test Cases ───────────────────────────────────────────────────────────────

class TestOTPCitizenFlow(unittest.TestCase):
    """Feature 1 & 7: Mobile OTP citizen registration and login"""

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()
        self.mobile = "9955551111"

        # Clean up test data
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.mobile).delete()
        self.db.query(User).filter(User.mobile == self.mobile).delete()
        self.db.commit()

    def tearDown(self):
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.mobile).delete()
        self.db.query(User).filter(User.mobile == self.mobile).delete()
        self.db.commit()
        self.db.close()

    def test_01_otp_send_and_verify_new_user(self):
        print("\n[Test 1.1] OTP Send → Verify → is_new_user for unregistered mobile")

        # Send OTP
        res = self.client.post('/api/auth/otp/send', json={"mobile": self.mobile})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data["success"])
        raw_otp = data.get("otp")
        self.assertIsNotNone(raw_otp, "OTP not returned in dev mode response")
        print(f"  OTP received: {raw_otp}")

        # Verify OTP for unregistered number — should get is_new_user=True
        res2 = self.client.post('/api/auth/otp/verify', json={"mobile": self.mobile, "otp": raw_otp})
        self.assertEqual(res2.status_code, 200)
        data2 = json.loads(res2.data)
        self.assertTrue(data2["success"])
        self.assertTrue(data2.get("is_new_user"), "Expected is_new_user=True for unregistered mobile")
        print("  Got is_new_user=True for unregistered mobile ✓")

    def test_02_full_citizen_registration(self):
        print("\n[Test 1.2] Full OTP registration for a new citizen")

        # Send OTP
        res = self.client.post('/api/auth/otp/send', json={"mobile": self.mobile})
        raw_otp = json.loads(res.data).get("otp")

        # Register
        res2 = self.client.post('/api/auth/otp/register', json={
            "full_name": "Ramu Test",
            "mobile": self.mobile,
            "otp": raw_otp,
            "age": 27,
            "gender": "Male",
            "blood_group": "B+",
        })
        self.assertEqual(res2.status_code, 201)
        data2 = json.loads(res2.data)
        self.assertTrue(data2["success"])
        self.assertIn("token", data2)
        self.assertEqual(data2["user"]["full_name"], "Ramu Test")
        self.assertEqual(data2["user"]["mobile"], self.mobile)
        self.assertIsNone(data2["user"].get("password"), "Password should NOT be returned")
        print(f"  Citizen registered: ID={data2['user']['unique_id']} ✓")

    def test_03_registered_citizen_login(self):
        print("\n[Test 1.3] Registered citizen can login via OTP")

        # Register first
        res = self.client.post('/api/auth/otp/send', json={"mobile": self.mobile})
        raw_otp = json.loads(res.data).get("otp")
        self.client.post('/api/auth/otp/register', json={
            "full_name": "Ramu Test", "mobile": self.mobile, "otp": raw_otp
        })

        # Clean OTP records
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.mobile).delete()
        self.db.commit()

        # Login — send new OTP
        res2 = self.client.post('/api/auth/otp/send', json={"mobile": self.mobile})
        print("  test_03 res2 status:", res2.status_code, "body:", res2.data.decode('utf-8'))
        raw_otp2 = json.loads(res2.data).get("otp")

        # Verify — should return token
        res3 = self.client.post('/api/auth/otp/verify', json={"mobile": self.mobile, "otp": raw_otp2})
        print("  test_03 res3 status:", res3.status_code, "body:", res3.data.decode('utf-8'))
        self.assertEqual(res3.status_code, 200)
        data3 = json.loads(res3.data)
        self.assertTrue(data3["success"])
        self.assertIn("token", data3)
        self.assertFalse(data3.get("is_new_user", False), "Registered user should NOT get is_new_user")
        self.assertEqual(data3["user"]["mobile"], self.mobile)
        print(f"  Citizen login successful: entityType={data3.get('entityType')} ✓")

    def test_04_duplicate_mobile_registration_blocked(self):
        print("\n[Test 1.4] Duplicate mobile registration is blocked")

        # Register once
        res = self.client.post('/api/auth/otp/send', json={"mobile": self.mobile})
        raw_otp = json.loads(res.data).get("otp")
        self.client.post('/api/auth/otp/register', json={
            "full_name": "Ramu Test", "mobile": self.mobile, "otp": raw_otp
        })
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.mobile).delete()
        self.db.commit()

        # Try to register again with same mobile
        res2 = self.client.post('/api/auth/otp/send', json={"mobile": self.mobile})
        print("  test_04 res2 status:", res2.status_code, "body:", res2.data.decode('utf-8'))
        raw_otp2 = json.loads(res2.data).get("otp")
        res3 = self.client.post('/api/auth/otp/register', json={
            "full_name": "Duplicate User", "mobile": self.mobile, "otp": raw_otp2
        })
        print("  test_04 res3 status:", res3.status_code, "body:", res3.data.decode('utf-8'))
        self.assertEqual(res3.status_code, 409, "Duplicate registration should return 409")
        print("  Duplicate registration correctly blocked with 409 ✓")

    def test_05_invalid_otp_rejected(self):
        print("\n[Test 1.5] Invalid OTP is rejected")

        self.client.post('/api/auth/otp/send', json={"mobile": self.mobile})
        res = self.client.post('/api/auth/otp/verify', json={"mobile": self.mobile, "otp": "000000"})
        self.assertEqual(res.status_code, 400)
        data = json.loads(res.data)
        self.assertFalse(data["success"])
        print("  Invalid OTP correctly rejected ✓")

    def test_06_password_login_disabled(self):
        print("\n[Test 1.6] Password-based logins return 410 Gone")

        routes = [
            ('/api/auth/user/login',     {"email": "test@test.com", "password": "pass"}),
            ('/api/auth/user/register',  {"email": "test@test.com", "password": "pass", "full_name": "X", "mobile": "0"}),
            ('/api/auth/login',          {"email": "test@test.com", "password": "pass"}),
            ('/api/auth/hospital/login', {"email": "test@test.com", "password": "pass"}),
            ('/api/auth/ambulance/login',{"email": "test@test.com", "password": "pass"}),
        ]
        for route, payload in routes:
            r = self.client.post(route, json=payload)
            self.assertEqual(r.status_code, 410, f"Expected 410 for {route}, got {r.status_code}")
            print(f"  {route} → 410 Gone ✓")


class TestServiceAccountAdminCreation(unittest.TestCase):
    """Ensure service accounts can ONLY be created by admin, not self-registered"""

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()
        self.test_mobile = "9955552222"

        # Cleanup
        self.db.query(Hospital).filter(Hospital.mobile == self.test_mobile).delete()
        self.db.query(AmbulanceDriver).filter(AmbulanceDriver.mobile == self.test_mobile).delete()
        self.db.query(User).filter(User.mobile == self.test_mobile).delete()
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.test_mobile).delete()
        self.db.commit()

    def tearDown(self):
        self.db.query(Hospital).filter(Hospital.mobile == self.test_mobile).delete()
        self.db.query(AmbulanceDriver).filter(AmbulanceDriver.mobile == self.test_mobile).delete()
        self.db.query(User).filter(User.mobile == self.test_mobile).delete()
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.test_mobile).delete()
        self.db.commit()
        self.db.close()

    def _get_admin_headers(self):
        token = _admin_token(self.client)
        self.assertIsNotNone(token, "Admin login failed — check ADMIN_EMAIL / ADMIN_PASSWORD env vars")
        return {"Authorization": f"Bearer {token}"}

    def test_01_admin_creates_hospital(self):
        print("\n[Test 2.1] Admin creates a hospital account")
        headers = self._get_admin_headers()

        res = self.client.post('/api/admin/services/register', json={
            "role": "hospital",
            "name": "Test City Hospital",
            "mobile": self.test_mobile,
            "latitude": 16.5063,
            "longitude": 80.6480,
            "city": "Vijayawada",
            "state": "Andhra Pradesh",
            "bed_capacity": 100,
        }, headers=headers)

        self.assertEqual(res.status_code, 201)
        data = json.loads(res.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["hospital"]["mobile"], self.test_mobile)
        self.assertFalse(data["hospital"].get("mobile_verified", True), "Newly created account should have mobile_verified=False")
        print(f"  Hospital created: {data['hospital']['name']} ✓")

    def test_02_service_mobile_blocked_from_self_register(self):
        print("\n[Test 2.2] Service account mobile cannot be used to self-register as citizen")
        headers = self._get_admin_headers()

        # Create hospital with this mobile
        self.client.post('/api/admin/services/register', json={
            "role": "hospital",
            "name": "Block Test Hospital",
            "mobile": self.test_mobile,
            "latitude": 16.5063,
            "longitude": 80.6480,
        }, headers=headers)

        # Try to register as citizen with same mobile
        self.client.post('/api/auth/otp/send', json={"mobile": self.test_mobile})
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.test_mobile).delete()
        self.db.commit()
        # Manually add an OTP record for this mobile
        res = self.client.post('/api/auth/otp/send', json={"mobile": self.test_mobile})
        raw_otp = json.loads(res.data).get("otp")

        res2 = self.client.post('/api/auth/otp/register', json={
            "full_name": "Sneaky User", "mobile": self.test_mobile, "otp": raw_otp
        })
        self.assertEqual(res2.status_code, 409, "Should block with 409 — mobile already used")
        print("  Duplicate mobile from hospital blocked on citizen register ✓")

    def test_03_service_login_blocks_unregistered_mobile(self):
        print("\n[Test 2.3] Unregistered mobile on service portal returns error (not is_new_user)")

        unregistered = "9955559999"
        self.client.post('/api/auth/otp/send', json={"mobile": unregistered})
        self.db.query(OTPVerification).filter(OTPVerification.mobile == unregistered).delete()
        self.db.commit()

        res = self.client.post('/api/auth/otp/send', json={"mobile": unregistered})
        raw_otp = json.loads(res.data).get("otp")

        # Try to verify with role=hospital hint
        res2 = self.client.post('/api/auth/otp/verify', json={
            "mobile": unregistered, "otp": raw_otp, "role": "hospital"
        })
        self.assertEqual(res2.status_code, 400)
        data2 = json.loads(res2.data)
        self.assertFalse(data2["success"])
        self.assertNotIn("is_new_user", data2, "Service portal must NOT return is_new_user flag")
        print(f"  Service portal OTP verify error for unregistered: '{data2['message']}' ✓")
        self.db.query(OTPVerification).filter(OTPVerification.mobile == unregistered).delete()
        self.db.commit()

    def test_04_service_account_activates_on_first_otp_login(self):
        print("\n[Test 2.4] Admin-created service account activates on first OTP login")
        headers = self._get_admin_headers()

        # Admin creates hospital
        self.client.post('/api/admin/services/register', json={
            "role": "hospital",
            "name": "Activation Test Hospital",
            "mobile": self.test_mobile,
            "latitude": 16.5063,
            "longitude": 80.6480,
        }, headers=headers)

        # Verify mobile_verified starts as False
        h = self.db.query(Hospital).filter(Hospital.mobile == self.test_mobile).first()
        self.assertIsNotNone(h)
        self.assertFalse(h.mobile_verified, "Should start unverified")

        # First OTP login
        res = self.client.post('/api/auth/otp/send', json={"mobile": self.test_mobile})
        raw_otp = json.loads(res.data).get("otp")
        res2 = self.client.post('/api/auth/otp/verify', json={
            "mobile": self.test_mobile, "otp": raw_otp, "role": "hospital"
        })
        self.assertEqual(res2.status_code, 200)
        data2 = json.loads(res2.data)
        self.assertTrue(data2["success"])
        self.assertIn("token", data2)

        # Re-query from DB — should now be verified
        h_updated = self.db.query(Hospital).filter(Hospital.mobile == self.test_mobile).first()
        self.assertTrue(h_updated.mobile_verified, "Should be verified after first OTP login")
        print("  Account activated on first OTP login ✓")

    def test_05_duplicate_mobile_blocked_at_admin_creation(self):
        print("\n[Test 2.5] Admin cannot register the same mobile twice")
        headers = self._get_admin_headers()

        # First create
        self.client.post('/api/admin/services/register', json={
            "role": "hospital",
            "name": "First Hospital",
            "mobile": self.test_mobile,
            "latitude": 16.5063,
            "longitude": 80.6480,
        }, headers=headers)

        # Attempt second create with same mobile
        res2 = self.client.post('/api/admin/services/register', json={
            "role": "ambulance",
            "name": "Second Entity Same Mobile",
            "mobile": self.test_mobile,
        }, headers=headers)
        self.assertEqual(res2.status_code, 409)
        print("  Duplicate mobile blocked at admin creation level ✓")

    def test_06_admin_creates_volunteer(self):
        print("\n[Test 2.6] Admin creates a volunteer personnel account")
        headers = self._get_admin_headers()
        vol_mobile = "9955553333"

        self.db.query(User).filter(User.mobile == vol_mobile).delete()
        self.db.commit()

        res = self.client.post('/api/admin/users/create', json={
            "role": "volunteer",
            "name": "Siva Volunteer",
            "mobile": vol_mobile,
            "department": "Civil Defence",
        }, headers=headers)

        self.assertEqual(res.status_code, 201)
        data = json.loads(res.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["user"]["mobile"], vol_mobile)
        self.assertEqual(data["user"]["role"], "volunteer")
        print(f"  Volunteer created: {data['user']['full_name']} ✓")

        self.db.query(User).filter(User.mobile == vol_mobile).delete()
        self.db.commit()


class TestBulkDeviceGeneration(unittest.TestCase):
    """Feature 2: Bulk Device Generation"""

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def test_01_admin_bulk_provision(self):
        print("\n[Test 3.1] Admin bulk provisions 5 devices")
        token = _admin_token(self.client)
        headers = {"Authorization": f"Bearer {token}"}

        res = self.client.post('/api/admin/devices/bulk', json={"count": 5}, headers=headers)
        self.assertEqual(res.status_code, 201)
        data = json.loads(res.data)
        self.assertTrue(data["success"])
        self.assertEqual(len(data["devices"]), 5)
        d = data["devices"][0]
        self.assertEqual(len(d["device_id"]), 16)
        self.assertEqual(len(d["pass_name"]), 8)
        self.assertEqual(len(d["sim_code"]), 13)
        print(f"  Provisioned 5 devices. Sample: {d['device_id']} ✓")

    def test_02_inventory_visible(self):
        print("\n[Test 3.2] Admin can view device inventory")
        headers = {"Authorization": f"Bearer {_admin_token(self.client)}"}
        res = self.client.get('/api/admin/devices/inventory', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data["success"])
        print(f"  Inventory returned {len(data['devices'])} unassigned devices ✓")


class TestDevicePairing(unittest.TestCase):
    """Feature 5 & 8: QR Device Pairing and Vehicle Details"""

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()

        # Ensure clean state
        test_dev = self.db.query(Device).filter(Device.device_id == "8811111111111188").first()
        if test_dev:
            self.db.query(VehicleInformation).filter(VehicleInformation.device_id == test_dev.id).delete()
            self.db.delete(test_dev)
        self.db.query(User).filter(User.mobile == "9955554444").delete()
        self.db.commit()

        # Create a test user with direct DB insert
        self.user = User(
            unique_id="AB121212",
            full_name="Pairing Tester",
            mobile="9955554444",
            role="user",
            is_active=True,
            mobile_verified=True,
        )
        self.db.add(self.user)

        # Create a pre-provisioned device
        self.device = Device(
            device_id="8811111111111188",
            pass_name="PAIRTEST",
            pass_code="PASSCODE1",
            sim_code="8811111111188",
            status="inactive",
            is_active=True,
            is_linked=False,
        )
        self.db.add(self.device)
        self.db.commit()

    def tearDown(self):
        dev = self.db.query(Device).filter(Device.device_id == "8811111111111188").first()
        if dev:
            self.db.query(VehicleInformation).filter(VehicleInformation.device_id == dev.id).delete()
            self.db.delete(dev)
        self.db.query(User).filter(User.mobile == "9955554444").delete()
        self.db.commit()
        self.db.close()

    def test_01_qr_device_pairing(self):
        print("\n[Test 4.1] QR device pairing and vehicle creation")
        token = generate_token({"id": self.user.id, "role": "user"})
        headers = {"Authorization": f"Bearer {token}"}

        res = self.client.post('/api/devices/register-qr', json={
            "deviceCode": "8811111111111188",
            "passName": "PAIRTEST",
            "passCode": "PASSCODE1",
            "simCode": "8811111111188",
            "vehicle_type": "Car",
            "vehicle_number": "AP16ZZ0099",
            "vehicle_model": "Baleno",
            "manufacturer": "Maruti",
            "year": 2022,
        }, headers=headers)

        self.assertEqual(res.status_code, 201)
        data = json.loads(res.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["device"]["device_id"], "8811111111111188")

        # Re-query from DB to verify state
        dev_updated = self.db.query(Device).filter(Device.device_id == "8811111111111188").first()
        self.assertTrue(dev_updated.is_linked)
        vehicle = self.db.query(VehicleInformation).filter(
            VehicleInformation.device_id == dev_updated.id
        ).first()
        self.assertIsNotNone(vehicle)
        self.assertEqual(vehicle.vehicle_number, "AP16ZZ0099")
        print(f"  Device paired, vehicle {vehicle.vehicle_number} created ✓")


class TestGPSSpeedCalculation(unittest.TestCase):
    """Feature 3: Auto Speed Calculation via GPS"""

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()

        spd_dev = self.db.query(Device).filter(Device.device_id == "7700000000000077").first()
        if spd_dev:
            try:
                from app import GPSSpeedLog
                self.db.query(GPSSpeedLog).filter(GPSSpeedLog.device_id == spd_dev.id).delete()
            except Exception:
                pass
            self.db.delete(spd_dev)
        self.db.commit()

        self.device = Device(
            device_id="7700000000000077",
            pass_name="SPEEDT01",
            pass_code="PASSSP01",
            sim_code="7700000000077",
            status="active",
            is_active=True,
        )
        self.db.add(self.device)
        self.db.commit()

    def tearDown(self):
        dev = self.db.query(Device).filter(Device.device_id == "7700000000000077").first()
        if dev:
            try:
                from app import GPSSpeedLog
                self.db.query(GPSSpeedLog).filter(GPSSpeedLog.device_id == dev.id).delete()
            except Exception:
                pass
            self.db.delete(dev)
        self.db.commit()
        self.db.close()

    def test_01_speed_logging_and_calculation(self):
        print("\n[Test 5.1] GPS speed calculation across two coordinates")

        # First position fix
        lat1, lng1 = 16.5061, 80.6480
        process_gps_speed_and_logs(self.db, "7700000000000077", lat1, lng1)

        # Second position ~1 km away
        lat2, lng2 = 16.5120, 80.6550
        process_gps_speed_and_logs(self.db, "7700000000000077", lat2, lng2)

        # Re-query device for updated speed values
        dev_updated = self.db.query(Device).filter(Device.device_id == "7700000000000077").first()
        self.assertIsNotNone(dev_updated)
        self.assertIsNotNone(dev_updated.current_speed)
        self.assertGreaterEqual(dev_updated.peak_speed, 0.0)
        self.assertLessEqual(dev_updated.current_speed, 220.0, "Speed should be capped at 220 km/h")
        print(f"  Current speed: {dev_updated.current_speed} km/h | Peak: {dev_updated.peak_speed} km/h ✓")


class TestMobileUniqueness(unittest.TestCase):
    """Global mobile uniqueness across all entity tables"""

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()
        self.shared_mobile = "9955556666"

        # Clean up all entities with this mobile
        self.db.query(User).filter(User.mobile == self.shared_mobile).delete()
        self.db.query(Hospital).filter(Hospital.mobile == self.shared_mobile).delete()
        self.db.query(AmbulanceDriver).filter(AmbulanceDriver.mobile == self.shared_mobile).delete()
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.shared_mobile).delete()
        self.db.commit()

    def tearDown(self):
        self.db.query(User).filter(User.mobile == self.shared_mobile).delete()
        self.db.query(Hospital).filter(Hospital.mobile == self.shared_mobile).delete()
        self.db.query(AmbulanceDriver).filter(AmbulanceDriver.mobile == self.shared_mobile).delete()
        self.db.query(OTPVerification).filter(OTPVerification.mobile == self.shared_mobile).delete()
        self.db.commit()
        self.db.close()

    def test_01_cross_table_uniqueness_enforced(self):
        print("\n[Test 6.1] Mobile uniqueness enforced across all entity tables")
        headers = {"Authorization": f"Bearer {_admin_token(self.client)}"}

        res1 = self.client.post('/api/admin/services/register', json={
            "role": "hospital",
            "name": "Unique Check Hospital",
            "mobile": self.shared_mobile,
            "latitude": 16.5063,
            "longitude": 80.6480,
        }, headers=headers)
        print("  res1 status:", res1.status_code, "body:", res1.data.decode('utf-8'))
        self.assertEqual(res1.status_code, 201)

        # Try to register ambulance with same mobile
        res2 = self.client.post('/api/admin/services/register', json={
            "role": "ambulance",
            "name": "Duplicate Mobile Ambulance",
            "mobile": self.shared_mobile,
        }, headers=headers)
        print("  res2 status:", res2.status_code, "body:", res2.data.decode('utf-8'))
        self.assertEqual(res2.status_code, 409)
        print("  Hospital+Ambulance cross-table duplicate blocked ✓")

        # Try to register citizen with same mobile
        res3 = self.client.post('/api/auth/otp/send', json={"mobile": self.shared_mobile})
        raw_otp = json.loads(res3.data).get("otp")
        res4 = self.client.post('/api/auth/otp/register', json={
            "full_name": "Sneaky Citizen", "mobile": self.shared_mobile, "otp": raw_otp
        })
        self.assertEqual(res4.status_code, 409)
        print("  Hospital→Citizen mobile reuse blocked at registration ✓")


class TestRoleBasedDashboardRedirect(unittest.TestCase):
    """Verify each role receives the correct entityType and response key"""

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()

    def _login_cycle(self, mobile, role_hint):
        """Send OTP and verify; return response data."""
        res_send = self.client.post('/api/auth/otp/send', json={"mobile": mobile})
        raw_otp = json.loads(res_send.data).get("otp")
        if not raw_otp:
            return None
        res_verify = self.client.post('/api/auth/otp/verify', json={
            "mobile": mobile, "otp": raw_otp, "role": role_hint
        })
        return json.loads(res_verify.data)

    def test_01_hospital_login_returns_hospital_key(self):
        print("\n[Test 7.1] Hospital login returns 'hospital' response key")
        mobile = "9300001111"
        h = self.db.query(Hospital).filter(Hospital.mobile == mobile).first()
        if not h:
            self.skipTest("No seeded hospital with mobile 9300001111. Run seed.py first.")

        # Make sure mobile_verified=True so login works
        h.mobile_verified = True
        h.is_active = True
        self.db.commit()

        # Clean old OTPs
        self.db.query(OTPVerification).filter(OTPVerification.mobile == mobile).delete()
        self.db.commit()

        data = self._login_cycle(mobile, "hospital")
        if data and not data.get("is_new_user"):
            self.assertIn("hospital", data, "Response must contain 'hospital' key")
            self.assertEqual(data.get("entityType"), "hospital")
            print(f"  Hospital login: entityType={data.get('entityType')} ✓")
        else:
            print("  (Hospital not in DB or already logged in — skipped)")

    def test_02_policeman_login_returns_policeman_key(self):
        print("\n[Test 7.2] Policeman login returns 'policeman' response key")
        mobile = "9600001111"
        p = self.db.query(Policeman).filter(Policeman.mobile == mobile).first()
        if not p:
            self.skipTest("No seeded policeman with mobile 9600001111. Run seed.py first.")

        p.mobile_verified = True
        p.is_active = True
        self.db.commit()

        self.db.query(OTPVerification).filter(OTPVerification.mobile == mobile).delete()
        self.db.commit()

        data = self._login_cycle(mobile, "policeman")
        if data and "policeman" in data:
            self.assertEqual(data.get("entityType"), "policeman")
            print(f"  Policeman login: entityType={data.get('entityType')} ✓")


class TestSuperAdminManagement(unittest.TestCase):
    """Verify CRUD actions on admin accounts by Super Admins and enforcement rules."""

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()
        self.db.query(User).filter(User.mobile == "9955558888").delete()
        self.db.query(OTPVerification).filter(OTPVerification.mobile == "9955558888").delete()
        self.db.commit()

    def tearDown(self):
        # Clean up created admins and test user
        self.db.query(User).filter(User.email == "testadmin@aapadbandhav.in").delete()
        self.db.query(User).filter(User.mobile == "9955558888").delete()
        self.db.query(OTPVerification).filter(OTPVerification.mobile == "9955558888").delete()
        self.db.commit()
        self.db.close()

    def _get_superadmin_headers(self):
        res = self.client.post('/api/auth/admin/login', json={
            "email": "admin@aapadbandhav.in",
            "password": "admin"
        })
        token = json.loads(res.data).get("token")
        return {"Authorization": f"Bearer {token}"}

    def _get_normal_user_headers(self):
        res_send = self.client.post('/api/auth/otp/send', json={"mobile": "9955558888"})
        raw_otp = json.loads(res_send.data).get("otp", "123456")
        
        res_reg = self.client.post('/api/auth/otp/register', json={
            "full_name": "Normal User",
            "mobile": "9955558888",
            "otp": raw_otp,
            "email": "normal@example.com"
        })
        token = json.loads(res_reg.data).get("token")
        return {"Authorization": f"Bearer {token}"}

    def test_01_superadmin_crud_flow(self):
        print("\n[Test 8.1] Super Admin CRUD flow on sub-admins")
        headers = self._get_superadmin_headers()
        
        # 1. List admins
        res = self.client.get('/api/admin/manage/admins', headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data.get("success"))
        
        # 2. Create sub-admin
        create_payload = {
            "name": "Test Administrator",
            "mobile": "7777777777",
            "email": "testadmin@aapadbandhav.in",
            "role": "admin",
            "permissions": ["manage_users", "manage_devices"]
        }
        res_create = self.client.post('/api/admin/manage/admins', json=create_payload, headers=headers)
        self.assertEqual(res_create.status_code, 201)
        created_data = json.loads(res_create.data)
        self.assertTrue(created_data.get("success"))
        admin_id = created_data["admin"]["id"]
        
        # 3. Edit sub-admin
        update_payload = {
            "name": "Test Admin Updated",
            "email": "testadmin@aapadbandhav.in",
            "role": "admin",
            "permissions": ["manage_users", "manage_devices", "manage_vehicles"]
        }
        res_update = self.client.put(f'/api/admin/manage/admins/{admin_id}', json=update_payload, headers=headers)
        self.assertEqual(res_update.status_code, 200)
        
        # 4. Toggle active state
        res_toggle = self.client.put(f'/api/admin/manage/admins/{admin_id}/toggle', headers=headers)
        self.assertEqual(res_toggle.status_code, 200)
        toggled_data = json.loads(res_toggle.data)
        self.assertEqual(toggled_data["admin"]["is_active"], False)
        
        # 5. Delete sub-admin
        res_delete = self.client.delete(f'/api/admin/manage/admins/{admin_id}', headers=headers)
        self.assertEqual(res_delete.status_code, 200)
        print("  Super Admin CRUD flows verified successfully ✓")

    def test_02_unauthorized_admin_management_blocked(self):
        print("\n[Test 8.2] Block unauthorized role from Admin Management endpoints")
        user_headers = self._get_normal_user_headers()
        
        # Try to list admins as citizen user
        res = self.client.get('/api/admin/manage/admins', headers=user_headers)
        self.assertEqual(res.status_code, 403)
        
        # Try to create admin as citizen user
        res_create = self.client.post('/api/admin/manage/admins', json={
            "name": "Hack Admin",
            "mobile": "7777777778"
        }, headers=user_headers)
        self.assertEqual(res_create.status_code, 403)
        print("  Enforcement checks verified successfully ✓")



class TestDeviceValidationSharingAndBulkActions(unittest.TestCase):
    """Feature: QR validation, sharing, accessible list, live map, and admin bulk actions"""
    
    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        self.db = SessionLocal()
        
        # Create a test owner user
        self.owner = self.db.query(User).filter(User.mobile == "9955554101").first()
        if not self.owner:
            self.owner = User(
                unique_id="AB994101",
                full_name="Owner User",
                mobile="9955554101",
                role="user",
                is_active=True,
                mobile_verified=True
            )
            self.db.add(self.owner)
            
        # Create a test recipient user
        self.recipient = self.db.query(User).filter(User.mobile == "9955554102").first()
        if not self.recipient:
            self.recipient = User(
                unique_id="AB994102",
                full_name="Recipient User",
                mobile="9955554102",
                role="user",
                is_active=True,
                mobile_verified=True
            )
            self.db.add(self.recipient)
            
        # Create a test admin user
        self.admin = self.db.query(User).filter(User.mobile == "9955554103").first()
        if not self.admin:
            self.admin = User(
                unique_id="AB994103",
                full_name="Admin User",
                mobile="9955554103",
                role="admin",
                is_active=True,
                mobile_verified=True
            )
            self.db.add(self.admin)
            
        # Create test devices
        self.dev1 = self.db.query(Device).filter(Device.device_id == "9900000000000001").first()
        if not self.dev1:
            self.dev1 = Device(
                device_id="9900000000000001",
                pass_name="DEVONE",
                pass_code="PASS1",
                sim_code="SIM99000000001",
                is_linked=False,
                is_active=True,
                status="inactive"
            )
            self.db.add(self.dev1)
            
        self.dev2 = self.db.query(Device).filter(Device.device_id == "9900000000000002").first()
        if not self.dev2:
            self.dev2 = Device(
                device_id="9900000000000002",
                pass_name="DEVTWO",
                pass_code="PASS2",
                sim_code="SIM99000000002",
                is_linked=False,
                is_active=True,
                status="inactive"
            )
            self.db.add(self.dev2)
            
        self.db.commit()
        
    def tearDown(self):
        self.db.query(DeviceShare).filter(DeviceShare.device_id.in_([self.dev1.id, self.dev2.id])).delete()
        self.db.query(VehicleInformation).filter(VehicleInformation.device_id.in_([self.dev1.id, self.dev2.id])).delete()
        self.db.query(Device).filter(Device.id.in_([self.dev1.id, self.dev2.id])).delete()
        self.db.query(User).filter(User.id.in_([self.owner.id, self.recipient.id, self.admin.id])).delete()
        self.db.commit()
        self.db.close()
        
    def test_01_validation_and_registration(self):
        print("\n[Test 9.1] Device QR validation and register-by-qr")
        owner_token = generate_token({"id": self.owner.id, "role": "user"})
        headers = {"Authorization": f"Bearer {owner_token}"}
        
        # Validate QR
        res = self.client.post('/api/devices/validate-qr', json={
            "qrCode": '{"deviceId": "9900000000000001", "type": "device_registration"}'
        }, headers=headers)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data["success"])
        
        # Register QR
        res_reg = self.client.post('/api/devices/register-by-qr', json={
            "qrCode": '{"deviceId": "9900000000000001", "type": "device_registration"}',
            "vehicle_type": "Car",
            "vehicle_number": "AP16ZZ9999",
            "vehicle_model": "Civic",
            "manufacturer": "Honda",
            "year": 2021
        }, headers=headers)
        self.assertEqual(res_reg.status_code, 201)
        data_reg = json.loads(res_reg.data)
        self.assertTrue(data_reg["success"])
        self.assertEqual(data_reg["device"]["device_id"], "9900000000000001")
        
    def test_02_sharing_and_live_map(self):
        print("\n[Test 9.2] Device sharing access rules and live tracking list")
        owner_token = generate_token({"id": self.owner.id, "role": "user"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        
        recipient_token = generate_token({"id": self.recipient.id, "role": "user"})
        recipient_headers = {"Authorization": f"Bearer {recipient_token}"}
        
        # First link dev1 to owner
        self.dev1.owner_id = self.owner.id
        self.dev1.is_linked = True
        self.db.add(self.dev1)
        self.db.commit()
        
        # Share dev1 with recipient
        res_share = self.client.post(f'/api/devices/{self.dev1.id}/share', json={
            "share_with_id": "AB994102"
        }, headers=owner_headers)
        self.assertEqual(res_share.status_code, 201)
        
        # Retrieve owner info as shared user
        res_owner = self.client.get(f'/api/devices/{self.dev1.id}/owner', headers=recipient_headers)
        self.assertEqual(res_owner.status_code, 200)
        
        # Retrieve my-accessible-devices as shared user
        res_access = self.client.get('/api/devices/my-accessible-devices', headers=recipient_headers)
        self.assertEqual(res_access.status_code, 200)
        data_access = json.loads(res_access.data)
        self.assertEqual(len(data_access["shared"]), 1)
        
        # Retrieve live-map/my-devices as shared user
        res_map = self.client.get('/api/live-map/my-devices', headers=recipient_headers)
        self.assertEqual(res_map.status_code, 200)
        
        # Revoke share
        res_revoke = self.client.delete(f'/api/devices/{self.dev1.id}/shared-user/{self.recipient.id}', headers=owner_headers)
        self.assertEqual(res_revoke.status_code, 200)
        
    def test_03_admin_bulk_actions(self):
        print("\n[Test 9.3] Admin bulk activation, deactivation, delete, and export")
        admin_token = generate_token({"id": self.admin.id, "role": "admin"})
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        device_ids = [self.dev1.id, self.dev2.id]
        
        # Bulk Activate
        res_act = self.client.post('/api/admin/devices/bulk-activate', json={"deviceIds": device_ids}, headers=headers)
        self.assertEqual(res_act.status_code, 200)
        
        # Bulk Deactivate
        res_deact = self.client.post('/api/admin/devices/bulk-deactivate', json={"deviceIds": device_ids}, headers=headers)
        self.assertEqual(res_deact.status_code, 200)
        
        # Bulk Export
        res_exp = self.client.post('/api/admin/devices/bulk-export', json={"deviceIds": device_ids}, headers=headers)
        self.assertEqual(res_exp.status_code, 200)
        data_exp = json.loads(res_exp.data)
        self.assertEqual(len(data_exp["devices"]), 2)
        
        # Bulk QR Download
        res_qr = self.client.post('/api/admin/devices/bulk-qr-download', json={"deviceIds": device_ids}, headers=headers)
        self.assertEqual(res_qr.status_code, 200)
        
        # Bulk Delete
        res_del = self.client.post('/api/admin/devices/bulk-delete', json={"deviceIds": device_ids}, headers=headers)
        self.assertEqual(res_del.status_code, 200)

    def test_04_device_locate(self):
        print("\n[Test 9.4] Device locate endpoint access rules and responses")
        owner_token = generate_token({"id": self.owner.id, "role": "user"})
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        
        recipient_token = generate_token({"id": self.recipient.id, "role": "user"})
        recipient_headers = {"Authorization": f"Bearer {recipient_token}"}
        
        # Link dev1 to owner
        self.dev1.owner_id = self.owner.id
        self.dev1.is_linked = True
        self.db.add(self.dev1)
        self.db.commit()
        
        # 1. Access without authorization -> 401 Unauthorized
        res_no_auth = self.client.get('/api/devices/locate?device_id=9900000000000001')
        self.assertEqual(res_no_auth.status_code, 401)
        
        # 2. Access by owner -> 200 OK (with no location data initially)
        res_owner = self.client.get('/api/devices/locate?device_id=9900000000000001', headers=owner_headers)
        self.assertEqual(res_owner.status_code, 200)
        data_owner = json.loads(res_owner.data)
        self.assertTrue(data_owner["success"])
        self.assertIsNone(data_owner["latitude"])
        
        # 3. Access by recipient (not shared yet) -> 403 Forbidden
        res_unshared = self.client.get('/api/devices/locate?device_id=9900000000000001', headers=recipient_headers)
        self.assertEqual(res_unshared.status_code, 403)
        
        # 4. Share dev1 with recipient
        res_share = self.client.post(f'/api/devices/{self.dev1.id}/share', json={
            "share_with_id": "AB994102"
        }, headers=owner_headers)
        self.assertEqual(res_share.status_code, 201)
        
        # 5. Access by recipient (now shared) -> 200 OK
        res_shared = self.client.get('/api/devices/locate?device_id=9900000000000001', headers=recipient_headers)
        self.assertEqual(res_shared.status_code, 200)
        data_shared = json.loads(res_shared.data)
        self.assertTrue(data_shared["success"])
        
        # 6. Test with location update
        # Simulate a location record
        from src.models.models import LiveLocation
        loc = LiveLocation(
            entity_id="9900000000000001",
            entity_type="device",
            latitude=16.5061,
            longitude=80.6480,
            speed=40.0,
            heading=180.0,
            accuracy=5.0
        )
        self.db.add(loc)
        self.db.commit()
        
        res_loc = self.client.get('/api/devices/locate?device_id=9900000000000001', headers=recipient_headers)
        self.assertEqual(res_loc.status_code, 200)
        data_loc = json.loads(res_loc.data)
        self.assertEqual(data_loc["latitude"], 16.5061)
        self.assertEqual(data_loc["longitude"], 80.6480)
        self.assertEqual(data_loc["speed"], 40.0)
        
        # Clean up simulated location
        self.db.delete(loc)
        self.db.commit()



if __name__ == '__main__':
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Run in logical order
    suite.addTests(loader.loadTestsFromTestCase(TestOTPCitizenFlow))
    suite.addTests(loader.loadTestsFromTestCase(TestServiceAccountAdminCreation))
    suite.addTests(loader.loadTestsFromTestCase(TestBulkDeviceGeneration))
    suite.addTests(loader.loadTestsFromTestCase(TestDevicePairing))
    suite.addTests(loader.loadTestsFromTestCase(TestGPSSpeedCalculation))
    suite.addTests(loader.loadTestsFromTestCase(TestMobileUniqueness))
    suite.addTests(loader.loadTestsFromTestCase(TestRoleBasedDashboardRedirect))
    suite.addTests(loader.loadTestsFromTestCase(TestSuperAdminManagement))
    suite.addTests(loader.loadTestsFromTestCase(TestDeviceValidationSharingAndBulkActions))

    runner = unittest.TextTestRunner(verbosity=2)
    runner.run(suite)

