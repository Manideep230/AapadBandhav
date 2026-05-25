import os
import random
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import (
    Base, User, Device, Hospital, AmbulanceDriver, PoliceStation,
    Policeman, Mechanic, InsuranceCompany, EmergencyContact, hash_password
)

MUMBAI_BASE = {"lat": 19.0760, "lng": 72.8777}

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
        
        # Reset collections
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
            db_uri = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'postgres')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'aapadbandhav_db')}"
        else:
            db_uri = "sqlite:///database.sqlite"

        print(f"Connecting to database: {db_uri}")
        engine = create_engine(db_uri)
        
        # Drop and recreate tables
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        print("Database tables reset and recreated.")

        Session = sessionmaker(bind=engine)
        db = Session()

    try:
        # --- USERS ---
        users = []
        user_data = [
            {"full_name": "Rahul Sharma", "email": "rahul@demo.com", "mobile": "9876543210", "vehicle_number": "MH01AB1234", "vehicle_type": "Car", "blood_group": "B+", "age": 28, "gender": "Male", "address": "Andheri West, Mumbai"},
            {"full_name": "Priya Patel", "email": "priya@demo.com", "mobile": "9876543211", "vehicle_number": "MH02CD5678", "vehicle_type": "Motorcycle", "blood_group": "O+", "age": 25, "gender": "Female", "address": "Bandra, Mumbai"},
            {"full_name": "Amit Kumar", "email": "amit@demo.com", "mobile": "9876543212", "vehicle_number": "MH03EF9012", "vehicle_type": "Car", "blood_group": "A+", "age": 35, "gender": "Male", "address": "Powai, Mumbai"},
        ]
        
        for u in user_data:
            user = User(
                unique_id="".join([str(random.randint(0, 9)) for _ in range(10)]),
                full_name=u["full_name"],
                email=u["email"],
                mobile=u["mobile"],
                password=hash_password("password123"),
                vehicle_number=u["vehicle_number"],
                vehicle_type=u["vehicle_type"],
                blood_group=u["blood_group"],
                age=u["age"],
                gender=u["gender"],
                address=u["address"],
                role="user",
                last_location_lat=random_offset(MUMBAI_BASE["lat"]),
                last_location_lng=random_offset(MUMBAI_BASE["lng"]),
                last_seen=datetime.datetime.utcnow()
            )
            db.add(user)
            db.flush()
            users.append(user)
            print(f"  User: {user.full_name} | ID: {user.unique_id}")

        # --- DEVICES ---
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
        
        # Link first device to first user
        first_device = db.query(Device).filter(Device.is_linked == False).first()
        if first_device and users:
            first_device.owner_id = users[0].id
            first_device.is_linked = True
            first_device.linked_at = datetime.datetime.utcnow()
            first_device.status = "active"
            print(f"  Device {first_device.device_id} linked to {users[0].full_name}")

        # --- EMERGENCY CONTACTS ---
        if users:
            contact1 = EmergencyContact(user_id=users[0].id, contact_name="Sunita Sharma", mobile="9111111111", relation="Wife", priority=1)
            contact2 = EmergencyContact(user_id=users[0].id, contact_name="Rajesh Sharma", mobile="9222222222", relation="Father", priority=2)
            db.add(contact1)
            db.add(contact2)

        # --- HOSPITALS ---
        hospital_data = [
            {"name": "Lilavati Hospital", "email": "lilavati@demo.com", "mobile": "9300001111", "latitude": 19.0591, "longitude": 72.8197, "city": "Mumbai", "bed_capacity": 200, "available_beds": 45, "specializations": ["Emergency", "Trauma", "ICU"]},
            {"name": "Kokilaben Hospital", "email": "kokilaben@demo.com", "mobile": "9300002222", "latitude": 19.1219, "longitude": 72.8320, "city": "Mumbai", "bed_capacity": 300, "available_beds": 78, "specializations": ["Emergency", "Cardiology", "Neurology"]},
            {"name": "Nanavati Hospital", "email": "nanavati@demo.com", "mobile": "9300003333", "latitude": 19.1057, "longitude": 72.8261, "city": "Mumbai", "bed_capacity": 150, "available_beds": 22, "specializations": ["Emergency", "Orthopedics"]},
        ]
        for h in hospital_data:
            hospital = Hospital(
                name=h["name"],
                email=h["email"],
                mobile=h["mobile"],
                password=hash_password("hospital123"),
                latitude=h["latitude"],
                longitude=h["longitude"],
                city=h["city"],
                state="Maharashtra",
                bed_capacity=h["bed_capacity"],
                available_beds=h["available_beds"],
                specializations=h["specializations"],
                registration_number=f"MH-HOSP-{random.randint(1000, 9999)}"
            )
            db.add(hospital)
            print(f"  Hospital: {hospital.name}")

        # --- AMBULANCE DRIVERS ---
        ambulance_data = [
            {"name": "Ravi Ambulance", "email": "ravi.amb@demo.com", "mobile": "9400001111", "vehicle_number": "MH01AMB001", "latitude": random_offset(MUMBAI_BASE["lat"]), "longitude": random_offset(MUMBAI_BASE["lng"])},
            {"name": "Sita Driver", "email": "sita.amb@demo.com", "mobile": "9400002222", "vehicle_number": "MH01AMB002", "latitude": random_offset(MUMBAI_BASE["lat"]), "longitude": random_offset(MUMBAI_BASE["lng"])},
            {"name": "Mohan Driver", "email": "mohan.amb@demo.com", "mobile": "9400003333", "vehicle_number": "MH01AMB003", "latitude": random_offset(MUMBAI_BASE["lat"]), "longitude": random_offset(MUMBAI_BASE["lng"])},
        ]
        for a in ambulance_data:
            driver = AmbulanceDriver(
                name=a["name"],
                email=a["email"],
                mobile=a["mobile"],
                password=hash_password("ambulance123"),
                vehicle_number=a["vehicle_number"],
                latitude=a["latitude"],
                longitude=a["longitude"],
                license_number=f"DL-{random.randint(1000000, 9999999)}",
                last_seen=datetime.datetime.utcnow()
            )
            db.add(driver)
            print(f"  Ambulance Driver: {driver.name}")

        # --- POLICE STATIONS ---
        station_data = [
            {"name": "Andheri Police Station", "email": "andheri.ps@demo.com", "mobile": "9500001111", "latitude": 19.1136, "longitude": 72.8697, "city": "Mumbai", "station_code": "MH-PS-ANW"},
            {"name": "Bandra Police Station", "email": "bandra.ps@demo.com", "mobile": "9500002222", "latitude": 19.0596, "longitude": 72.8295, "city": "Mumbai", "station_code": "MH-PS-BAN"},
        ]
        stations = []
        for s in station_data:
            station = PoliceStation(
                name=s["name"],
                email=s["email"],
                mobile=s["mobile"],
                password=hash_password("police123"),
                latitude=s["latitude"],
                longitude=s["longitude"],
                city=s["city"],
                state="Maharashtra",
                station_code=s["station_code"],
                address=f"{s['name']}, {s['city']}"
            )
            db.add(station)
            db.flush()
            stations.append(station)
            print(f"  Police Station: {station.name}")

        # --- POLICEMEN ---
        police_data = [
            {"name": "Constable Desai", "email": "desai@demo.com", "mobile": "9600001111", "badge_number": "MH-12345", "latitude": random_offset(MUMBAI_BASE["lat"]), "longitude": random_offset(MUMBAI_BASE["lng"])},
            {"name": "Constable Singh", "email": "singh@demo.com", "mobile": "9600002222", "badge_number": "MH-12346", "latitude": random_offset(MUMBAI_BASE["lat"]), "longitude": random_offset(MUMBAI_BASE["lng"])},
        ]
        for p in police_data:
            policeman = Policeman(
                name=p["name"],
                email=p["email"],
                mobile=p["mobile"],
                password=hash_password("police123"),
                badge_number=p["badge_number"],
                latitude=p["latitude"],
                longitude=p["longitude"],
                station_id=stations[0].id if stations else None,
                last_seen=datetime.datetime.utcnow()
            )
            db.add(policeman)
            print(f"  Policeman: {policeman.name}")

        # --- MECHANICS ---
        mechanic_data = [
            {"name": "Rajesh Mechanics", "email": "rajesh.mech@demo.com", "mobile": "9700001111", "specialization": "Car, Motorcycle", "latitude": random_offset(MUMBAI_BASE["lat"]), "longitude": random_offset(MUMBAI_BASE["lng"])},
            {"name": "Quick Fix Auto", "email": "quickfix@demo.com", "mobile": "9700002222", "specialization": "All vehicles", "latitude": random_offset(MUMBAI_BASE["lat"]), "longitude": random_offset(MUMBAI_BASE["lng"])},
        ]
        for m in mechanic_data:
            mechanic = Mechanic(
                name=m["name"],
                email=m["email"],
                mobile=m["mobile"],
                password=hash_password("mechanic123"),
                specialization=m["specialization"],
                latitude=m["latitude"],
                longitude=m["longitude"],
                last_seen=datetime.datetime.utcnow()
            )
            db.add(mechanic)
            print(f"  Mechanic: {mechanic.name}")

        # --- INSURANCE COMPANIES ---
        insurance = InsuranceCompany(
            name="Safe Drive Insurance",
            email="safedrive@demo.com",
            mobile="9800001111",
            password=hash_password("insurance123"),
            license_number="IRDAI-123456",
            latitude=19.0759,
            longitude=72.8776,
            city="Mumbai",
            address="Fort, Mumbai"
        )
        db.add(insurance)
        print("  Insurance Company: Safe Drive Insurance")

        db.commit()
        print("\nSEED DATA LOADED SUCCESSFULLY")
        print("---------------------------------")
        print("Default Accounts:")
        print("  Admin:      admin@aapadbandhav.in / Admin@2024")
        print("  User:       rahul@demo.com / password123")
        print("  Hospital:   lilavati@demo.com / hospital123")
        print("  Ambulance:  ravi.amb@demo.com / ambulance123")
        print("  Police:     andheri.ps@demo.com / police123")
        print("  Insurance:  safedrive@demo.com / insurance123")
        print("---------------------------------")

    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
