import os
import random
import datetime
import uuid
from app import (
    User, Device, Hospital, AmbulanceDriver, PoliceStation,
    Policeman, Mechanic, InsuranceCompany, EmergencyContact
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
        # ─── 1. CITIZEN USER (REMOVED) ────────────────────────────────────────
        pass

        # ─── 2. HOSPITAL ──────────────────────────────────────────────────────
        if db.query(Hospital).filter(Hospital.mobile == "9876500002").first():
            print("Hospital 9876500002 already exists. Skipping.")
        else:
            db.add(Hospital(
                name="Manipal Hospital Vijayawada",
                mobile="9876500002",
                password=None,
                latitude=16.4715,
                longitude=80.6214,
                city="Vijayawada",
                state="Andhra Pradesh",
                bed_capacity=150,
                available_beds=45,
                specializations=["Emergency", "Trauma", "ICU", "Cardiology"],
                registration_number="AP-VJA-HOSP-001",
                is_active=True,
                is_available=True,
                mobile_verified=True,
            ))
            print("Created Hospital: Manipal Hospital Vijayawada | Mobile: 9876500002")

        # ─── 3. AMBULANCE DRIVER ──────────────────────────────────────────────
        if db.query(AmbulanceDriver).filter(AmbulanceDriver.mobile == "9876500003").first():
            print("Ambulance 9876500003 already exists. Skipping.")
        else:
            db.add(AmbulanceDriver(
                name="Srinivas Rao",
                mobile="9876500003",
                password=None,
                vehicle_number="AP16TJ0001",
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                license_number="AP-16-AMB-001",
                is_active=True,
                is_available=True,
                mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print("Created Ambulance Driver: Srinivas Rao | Mobile: 9876500003")

        # ─── 4. POLICE STATION ────────────────────────────────────────────────
        existing_ps = db.query(PoliceStation).filter(PoliceStation.mobile == "9876500004").first()
        if existing_ps:
            print("Police Station 9876500004 already exists. Skipping.")
            station_id = existing_ps.id
        else:
            station = PoliceStation(
                name="Vijayawada Central Police Station",
                mobile="9876500004",
                password=None,
                latitude=16.5144,
                longitude=80.6276,
                city="Vijayawada",
                state="Andhra Pradesh",
                station_code="AP-PS-VJA",
                address="Governorpet, Vijayawada, Andhra Pradesh",
                is_active=True,
                is_available=True,
                mobile_verified=True,
            )
            db.add(station)
            db.flush()
            station_id = station.id
            print(f"Created Police Station: {station.name} | Mobile: 9876500004")

            # ─── 5. POLICEMAN ─────────────────────────────────────────────────
            db.add(Policeman(
                name="Inspector Prasad",
                mobile="9876500005",
                password=None,
                badge_number="AP-VJA-54321",
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                station_id=station_id,
                is_active=True,
                is_available=True,
                mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print("Created Policeman: Inspector Prasad | Mobile: 9876500005")

        # ─── 6. MECHANIC ──────────────────────────────────────────────────────
        if db.query(Mechanic).filter(Mechanic.mobile == "9876500006").first():
            print("Mechanic 9876500006 already exists. Skipping.")
        else:
            db.add(Mechanic(
                name="Venkatesh Auto Garage",
                mobile="9876500006",
                password=None,
                specialization="Car, Motorcycle",
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                is_active=True,
                is_available=True,
                mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print("Created Mechanic: Venkatesh Auto Garage | Mobile: 9876500006")

        # ─── 7. INSURANCE COMPANY ─────────────────────────────────────────────
        if db.query(InsuranceCompany).filter(InsuranceCompany.mobile == "9876500007").first():
            print("Insurance 9876500007 already exists. Skipping.")
        else:
            db.add(InsuranceCompany(
                name="Andhra Apex Insurance",
                mobile="9876500007",
                password=None,
                license_number="AP-IRDAI-99887",
                latitude=16.5070,
                longitude=80.6490,
                city="Vijayawada",
                address="MG Road, Vijayawada, Andhra Pradesh",
                is_active=True,
                mobile_verified=True,
            ))
            print("Created Insurance Company: Andhra Apex Insurance | Mobile: 9876500007")

        # ─── 8. VOLUNTEER ─────────────────────────────────────────────────────
        if db.query(User).filter(User.mobile == "9876500008").first():
            print("Volunteer 9876500008 already exists. Skipping.")
        else:
            db.add(User(
                full_name="Vijayawada Volunteer",
                mobile="9876500008",
                role="volunteer",
                last_location_lat=16.5061,
                last_location_lng=80.6482,
                is_active=True,
                is_available=True,
                mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print("Created Volunteer: Vijayawada Volunteer | Mobile: 9876500008")

        # ─── 9. FIRE DEPARTMENT ───────────────────────────────────────────────
        if db.query(User).filter(User.mobile == "9876500009").first():
            print("Fire Department 9876500009 already exists. Skipping.")
        else:
            db.add(User(
                full_name="Vijayawada Fire Station",
                mobile="9876500009",
                role="fire_department",
                last_location_lat=16.5065,
                last_location_lng=80.6478,
                is_active=True,
                is_available=True,
                mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print("Created Fire Department: Vijayawada Fire Station | Mobile: 9876500009")

        db.commit()
        print("\n" + "=" * 50)
        print("  VIJAYAWADA SEED DATA COMPLETED!")
        print("=" * 50)
        print("\nAuthentication: Mobile Number + OTP (no passwords)")
        print("  Hospital:      9876500002")
        print("  Ambulance:     9876500003")
        print("  Police Stn:    9876500004")
        print("  Policeman:     9876500005")
        print("  Mechanic:      9876500006")
        print("  Insurance:     9876500007")
        print("  Volunteer:     9876500008")
        print("  Fire Dept:     9876500009")
        print("=" * 50)

    except Exception as e:
        db.rollback()
        print(f"Seeding error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    seed_vijayawada()
