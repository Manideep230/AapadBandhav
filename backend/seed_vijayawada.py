import os
import random
import datetime
import uuid
from app import (
    User, Device, Hospital, AmbulanceDriver, PoliceStation,
    Policeman, Mechanic, InsuranceCompany, EmergencyContact, hash_password
)

VIJAYAWADA_BASE = {"lat": 16.5063, "lng": 80.6480}

def random_offset(base, range_val=0.03):
    return round(base + (random.random() - 0.5) * range_val, 6)

def seed_vijayawada():
    DB_DIALECT = os.getenv("DB_DIALECT", "sqlite")
    if DB_DIALECT == "mongodb":
        from app import mongo_db, MongoSession
        db = MongoSession(mongo_db)
        print("Connected to MongoDB Atlas for Vijayawada seeding.")
    else:
        from app import SessionLocal
        db = SessionLocal()
        print("Connected to SQL database for Vijayawada seeding.")

    try:
        # --- 1. USER (Citizen) ---
        user_email = "vijay@demo.com"
        # Check if already exists
        existing_user = db.query(User).filter(User.email == user_email).first()
        if existing_user:
            print(f"User {user_email} already exists. Skipping user creation.")
            user = existing_user
        else:
            user = User(
                unique_id="".join([str(random.randint(0, 9)) for _ in range(10)]),
                full_name="Vijay Kumar",
                email=user_email,
                mobile="9876500001",
                password=hash_password("password123"),
                vehicle_number="AP16AB1234",
                vehicle_type="Car",
                blood_group="A+",
                age=30,
                gender="Male",
                address="Benz Circle, Vijayawada, Andhra Pradesh",
                role="user",
                last_location_lat=VIJAYAWADA_BASE["lat"],
                last_location_lng=VIJAYAWADA_BASE["lng"],
                last_seen=datetime.datetime.utcnow()
            )
            db.add(user)
            db.flush()
            print(f"Created User: {user.full_name} ({user.email})")

            # Link Emergency Contacts
            contact1 = EmergencyContact(user_id=user.id, contact_name="Latha Kumar", mobile="9111100001", relation="Wife", priority=1)
            contact2 = EmergencyContact(user_id=user.id, contact_name="Rama Rao", mobile="9222200002", relation="Father", priority=2)
            db.add(contact1)
            db.add(contact2)

            # Create and Link a Device
            dev_id = "".join([str(random.randint(0, 9)) for _ in range(16)])
            device = Device(
                device_id=dev_id,
                qr_code=f"AAPAD-{dev_id}",
                owner_id=user.id,
                is_linked=True,
                linked_at=datetime.datetime.utcnow(),
                status="active"
            )
            db.add(device)
            print(f"Linked Device {device.device_id} to User.")

        # --- 2. HOSPITAL ---
        hosp_email = "manipal.vja@demo.com"
        existing_hosp = db.query(Hospital).filter(Hospital.email == hosp_email).first()
        if existing_hosp:
            print(f"Hospital {hosp_email} already exists. Skipping.")
        else:
            hospital = Hospital(
                name="Manipal Hospital Vijayawada",
                email=hosp_email,
                mobile="9876500002",
                password=hash_password("hospital123"),
                latitude=16.4715,
                longitude=80.6214,
                city="Vijayawada",
                state="Andhra Pradesh",
                bed_capacity=150,
                available_beds=45,
                specializations=["Emergency", "Trauma", "ICU", "Cardiology"],
                registration_number="AP-VJA-HOSP-001"
            )
            db.add(hospital)
            print(f"Created Hospital: {hospital.name}")

        # --- 3. AMBULANCE DRIVER ---
        amb_email = "srinivas.amb@demo.com"
        existing_amb = db.query(AmbulanceDriver).filter(AmbulanceDriver.email == amb_email).first()
        if existing_amb:
            print(f"Ambulance {amb_email} already exists. Skipping.")
        else:
            driver = AmbulanceDriver(
                name="Srinivas Rao",
                email=amb_email,
                mobile="9876500003",
                password=hash_password("ambulance123"),
                vehicle_number="AP16TJ0001",
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                license_number="AP-16-AMB-001",
                last_seen=datetime.datetime.utcnow()
            )
            db.add(driver)
            print(f"Created Ambulance Driver: {driver.name}")

        # --- 4. POLICE STATION ---
        ps_email = "central.vjaps@demo.com"
        existing_ps = db.query(PoliceStation).filter(PoliceStation.email == ps_email).first()
        if existing_ps:
            print(f"Police Station {ps_email} already exists. Skipping.")
            station_id = existing_ps.id
        else:
            station = PoliceStation(
                name="Vijayawada Central Police Station",
                email=ps_email,
                mobile="9876500004",
                password=hash_password("police123"),
                latitude=16.5144,
                longitude=80.6276,
                city="Vijayawada",
                state="Andhra Pradesh",
                station_code="AP-PS-VJA",
                address="Governorpet, Vijayawada, Andhra Pradesh"
            )
            db.add(station)
            db.flush()
            station_id = station.id
            print(f"Created Police Station: {station.name}")

            # --- 5. POLICEMAN (Officer) ---
            policeman = Policeman(
                name="Inspector Prasad",
                email="prasad.police@demo.com",
                mobile="9876500005",
                password=hash_password("police123"),
                badge_number="AP-VJA-54321",
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                station_id=station_id,
                last_seen=datetime.datetime.utcnow()
            )
            db.add(policeman)
            print(f"Created Policeman: {policeman.name}")

        # --- 6. MECHANIC ---
        mech_email = "venkatesh.mech@demo.com"
        existing_mech = db.query(Mechanic).filter(Mechanic.email == mech_email).first()
        if existing_mech:
            print(f"Mechanic {mech_email} already exists. Skipping.")
        else:
            mechanic = Mechanic(
                name="Venkatesh Auto Garage",
                email=mech_email,
                mobile="9876500006",
                password=hash_password("mechanic123"),
                specialization="Car, Motorcycle",
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                last_seen=datetime.datetime.utcnow()
            )
            db.add(mechanic)
            print(f"Created Mechanic: {mechanic.name}")

        # --- 7. INSURANCE COMPANY ---
        ins_email = "andhraapex@demo.com"
        existing_ins = db.query(InsuranceCompany).filter(InsuranceCompany.email == ins_email).first()
        if existing_ins:
            print(f"Insurance Company {ins_email} already exists. Skipping.")
        else:
            insurance = InsuranceCompany(
                name="Andhra Apex Insurance",
                email=ins_email,
                mobile="9876500007",
                password=hash_password("insurance123"),
                license_number="AP-IRDAI-99887",
                latitude=16.5070,
                longitude=80.6490,
                city="Vijayawada",
                address="MG Road, Vijayawada, Andhra Pradesh"
            )
            db.add(insurance)
            print(f"Created Insurance Company: {insurance.name}")

        db.commit()
        print("\nVIJAYAWADA SEED DATA COMPLETED SUCCESSFULLY!")

    except Exception as e:
        db.rollback()
        print(f"Seeding error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_vijayawada()
