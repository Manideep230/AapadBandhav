import os
import random
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import (
    Base, User, Device, Hospital, AmbulanceDriver, PoliceStation,
    Policeman, Mechanic, InsuranceCompany, EmergencyContact
)

VIJAYAWADA_BASE = {"lat": 16.5063, "lng": 80.6480}

def random_offset(base, range_val=0.05):
    return round(base + (random.random() - 0.5) * range_val, 6)

def generate_device_id():
    return "".join([str(random.randint(0, 9)) for _ in range(16)])

def seed():
    DB_DIALECT = os.getenv("DB_DIALECT", "sqlite")
    if DB_DIALECT == "mongodb":
        from app import mongo_db, MongoSession
        db = MongoSession(mongo_db)
        print("Connected to MongoDB for seeding.")
        collections_to_drop = [
            'users', 'devices', 'hospitals', 'ambulance_drivers',
            'police_stations', 'policemen', 'mechanics', 'insurance_companies',
            'emergency_contacts'
        ]
        for coll in collections_to_drop:
            mongo_db[coll].drop()
        print("MongoDB collections reset.")
    else:
        if DB_DIALECT == "postgres":
            db_uri = (
                f"postgresql://{os.getenv('DB_USER', 'postgres')}:"
                f"{os.getenv('DB_PASSWORD', 'postgres')}@"
                f"{os.getenv('DB_HOST', 'localhost')}:"
                f"{os.getenv('DB_PORT', '5432')}/"
                f"{os.getenv('DB_NAME', 'aapadbandhav_db')}"
            )
        else:
            db_uri = "sqlite:///database.sqlite"

        print(f"Connecting to database: {db_uri}")
        engine = create_engine(db_uri)

        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        print("Database tables reset and recreated.")

        Session = sessionmaker(bind=engine)
        db = Session()

    try:
        # ─── CITIZEN USERS (REMOVED) ──────────────────────────────────────────
        users = []

        # ─── DEVICES ─────────────────────────────────────────────────────────
        for _ in range(5):
            dev_id = generate_device_id()
            device = Device(
                device_id=dev_id,
                qr_code=f"AAPAD-{dev_id}",
                status="unlinked"
            )
            db.add(device)
            print(f"  Device: {device.device_id}")

        db.flush()

        # ─── HOSPITALS ────────────────────────────────────────────────────────
        hospital_data = [
            {"name": "Manipal Hospital Vijayawada", "mobile": "9300001111", "latitude": 16.5060, "longitude": 80.6450, "city": "Vijayawada", "bed_capacity": 300, "available_beds": 65, "specializations": ["Emergency", "Trauma", "ICU", "Cardiology"]},
            {"name": "Andhra Hospitals",            "mobile": "9300002222", "latitude": 16.5090, "longitude": 80.6510, "city": "Vijayawada", "bed_capacity": 200, "available_beds": 40, "specializations": ["Emergency", "Neurology", "Orthopedics"]},
            {"name": "Ramesh Hospitals",            "mobile": "9300003333", "latitude": 16.5030, "longitude": 80.6420, "city": "Vijayawada", "bed_capacity": 150, "available_beds": 25, "specializations": ["Emergency", "General Medicine"]},
        ]
        for h in hospital_data:
            db.add(Hospital(
                name=h["name"],
                mobile=h["mobile"],
                password=None,
                latitude=h["latitude"],
                longitude=h["longitude"],
                city=h["city"],
                state="Andhra Pradesh",
                bed_capacity=h["bed_capacity"],
                available_beds=h["available_beds"],
                specializations=h["specializations"],
                registration_number=f"AP-HOSP-{random.randint(1000, 9999)}",
                is_active=True,
                is_available=True,
                mobile_verified=True,
            ))
            print(f"  Hospital: {h['name']} | Mobile: {h['mobile']}")

        # ─── AMBULANCE DRIVERS ────────────────────────────────────────────────
        ambulance_data = [
            {"name": "Ravi Ambulance Service", "mobile": "9400001111", "vehicle_number": "AP16AMB001"},
            {"name": "Sita Emergency Services", "mobile": "9400002222", "vehicle_number": "AP16AMB002"},
            {"name": "Mohan Emergency Driver",  "mobile": "9400003333", "vehicle_number": "AP16AMB003"},
        ]
        for a in ambulance_data:
            db.add(AmbulanceDriver(
                name=a["name"],
                mobile=a["mobile"],
                password=None,
                vehicle_number=a["vehicle_number"],
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                license_number=f"AP-DL-{random.randint(1000000, 9999999)}",
                is_active=True,
                is_available=True,
                mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print(f"  Ambulance Driver: {a['name']} | Mobile: {a['mobile']}")

        # ─── POLICE STATIONS ──────────────────────────────────────────────────
        station_data = [
            {"name": "One Town Police Station",    "mobile": "9500001111", "latitude": 16.5074, "longitude": 80.6480, "city": "Vijayawada", "station_code": "AP-PS-VJA-OT"},
            {"name": "Governorpet Police Station", "mobile": "9500002222", "latitude": 16.5048, "longitude": 80.6365, "city": "Vijayawada", "station_code": "AP-PS-VJA-GP"},
        ]
        stations = []
        for s in station_data:
            station = PoliceStation(
                name=s["name"],
                mobile=s["mobile"],
                password=None,
                latitude=s["latitude"],
                longitude=s["longitude"],
                city=s["city"],
                state="Andhra Pradesh",
                station_code=s["station_code"],
                address=f"{s['name']}, {s['city']}, Andhra Pradesh",
                is_active=True,
                is_available=True,
                mobile_verified=True,
            )
            db.add(station)
            db.flush()
            stations.append(station)
            print(f"  Police Station: {station.name} | Mobile: {s['mobile']}")

        # ─── POLICEMEN ────────────────────────────────────────────────────────
        police_data = [
            {"name": "Constable Raju Reddy",   "mobile": "9600001111", "badge_number": "AP-12345"},
            {"name": "SI Venkata Rao",         "mobile": "9600002222", "badge_number": "AP-12346"},
            {"name": "Constable Lakshmi Devi", "mobile": "9600003333", "badge_number": "AP-12347"},
        ]
        for p in police_data:
            db.add(Policeman(
                name=p["name"],
                mobile=p["mobile"],
                password=None,
                badge_number=p["badge_number"],
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                station_id=stations[0].id if stations else None,
                is_active=True,
                is_available=True,
                mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print(f"  Policeman: {p['name']} | Mobile: {p['mobile']}")

        # ─── MECHANICS ────────────────────────────────────────────────────────
        mechanic_data = [
            {"name": "Rajesh Mechanics",    "mobile": "9700001111", "specialization": "Car, Motorcycle"},
            {"name": "Quick Fix Auto Works","mobile": "9700002222", "specialization": "All vehicles"},
        ]
        for m in mechanic_data:
            db.add(Mechanic(
                name=m["name"],
                mobile=m["mobile"],
                password=None,
                specialization=m["specialization"],
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                is_active=True,
                is_available=True,
                mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print(f"  Mechanic: {m['name']} | Mobile: {m['mobile']}")

        # ─── INSURANCE COMPANIES ──────────────────────────────────────────────
        db.add(InsuranceCompany(
            name="Safe Drive Insurance",
            mobile="9800001111",
            password=None,
            license_number="IRDAI-AP-123456",
            latitude=16.5063,
            longitude=80.6480,
            city="Vijayawada",
            address="MG Road, Vijayawada, Andhra Pradesh",
            is_active=True,
            mobile_verified=True,
        ))
        print("  Insurance: Safe Drive Insurance | Mobile: 9800001111")

        # ─── VOLUNTEER ────────────────────────────────────────────────────────
        db.add(User(
            full_name="Vijayawada Volunteer",
            mobile="9900001111",
            role="volunteer",
            last_location_lat=16.5061,
            last_location_lng=80.6482,
            is_active=True,
            is_available=True,
            mobile_verified=True,
            last_seen=datetime.datetime.utcnow()
        ))
        print("  Volunteer: Vijayawada Volunteer | Mobile: 9900001111")

        # ─── FIRE DEPARTMENT ──────────────────────────────────────────────────
        db.add(User(
            full_name="Vijayawada Fire Station",
            mobile="9100001111",
            role="fire_department",
            last_location_lat=16.5065,
            last_location_lng=80.6478,
            is_active=True,
            is_available=True,
            mobile_verified=True,
            last_seen=datetime.datetime.utcnow()
        ))
        print("  Fire Department: Vijayawada Fire Station | Mobile: 9100001111")

        db.commit()

        print("\n" + "=" * 50)
        print("  SEED DATA LOADED SUCCESSFULLY")
        print("=" * 50)
        print("\nAuthentication: Mobile Number + OTP (no passwords)")
        print("\nTest Mobiles for OTP Login:")
        print("  Admin (env):   ADMIN_EMAIL / ADMIN_PASSWORD (legacy admin portal)")
        print("  Hospital:      9300001111, 9300002222, 9300003333")
        print("  Ambulance:     9400001111, 9400002222, 9400003333")
        print("  Police Stn:    9500001111, 9500002222")
        print("  Policeman:     9600001111, 9600002222, 9600003333")
        print("  Mechanic:      9700001111, 9700002222")
        print("  Insurance:     9800001111")
        print("  Volunteer:     9900001111")
        print("  Fire Dept:     9100001111")
        print("=" * 50)

    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
