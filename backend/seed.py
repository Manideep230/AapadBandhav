import os
import random
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

VIJAYAWADA_BASE = {"lat": 16.5063, "lng": 80.6480}

def random_offset(base, range_val=0.05):
    return round(base + (random.random() - 0.5) * range_val, 6)

def generate_device_id():
    return "".join([str(random.randint(0, 9)) for _ in range(16)])

def seed(db=None, engine=None):
    """
    Seed the database with test data.
    Can be called with an existing db session, or standalone.
    """
    standalone = db is None

    if standalone:
        from app import Base, engine as app_engine, SessionLocal
        if engine is None:
            engine = app_engine
        from app import (
            User, Device, Hospital, AmbulanceDriver, PoliceStation,
            Policeman, Mechanic, InsuranceCompany, EmergencyContact
        )
        Session = sessionmaker(bind=engine)
        db = Session()
    else:
        from app import (
            User, Device, Hospital, AmbulanceDriver, PoliceStation,
            Policeman, Mechanic, InsuranceCompany, EmergencyContact
        )

    try:
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
            {"name": "Manipal Hospital Vijayawada",  "mobile": "9300001111", "latitude": 16.5060, "longitude": 80.6450, "city": "Vijayawada", "bed_capacity": 300, "available_beds": 65, "specializations": ["Emergency", "Trauma", "ICU", "Cardiology"]},
            {"name": "Andhra Hospitals",             "mobile": "9300002222", "latitude": 16.5090, "longitude": 80.6510, "city": "Vijayawada", "bed_capacity": 200, "available_beds": 40, "specializations": ["Emergency", "Neurology", "Orthopedics"]},
            {"name": "Ramesh Hospitals",             "mobile": "9300003333", "latitude": 16.5030, "longitude": 80.6420, "city": "Vijayawada", "bed_capacity": 150, "available_beds": 25, "specializations": ["Emergency", "General Medicine"]},
        ]
        for h in hospital_data:
            db.add(Hospital(
                name=h["name"], mobile=h["mobile"], password=None,
                latitude=h["latitude"], longitude=h["longitude"],
                city=h["city"], state="Andhra Pradesh",
                bed_capacity=h["bed_capacity"], available_beds=h["available_beds"],
                specializations=h["specializations"],
                registration_number=f"AP-HOSP-{random.randint(1000, 9999)}",
                is_active=True, is_available=True, mobile_verified=True,
            ))
            print(f"  Hospital: {h['name']} | Mobile: {h['mobile']}")

        # ─── AMBULANCE DRIVERS ────────────────────────────────────────────────
        ambulance_data = [
            {"name": "Ravi Ambulance Service",    "mobile": "9400001111", "vehicle_number": "AP16AMB001"},
            {"name": "Sita Emergency Services",   "mobile": "9400002222", "vehicle_number": "AP16AMB002"},
            {"name": "Mohan Emergency Driver",    "mobile": "9400003333", "vehicle_number": "AP16AMB003"},
        ]
        for a in ambulance_data:
            db.add(AmbulanceDriver(
                name=a["name"], mobile=a["mobile"], password=None,
                vehicle_number=a["vehicle_number"],
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                license_number=f"AP-DL-{random.randint(1000000, 9999999)}",
                is_active=True, is_available=True, mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print(f"  Ambulance: {a['name']} | Mobile: {a['mobile']}")

        # ─── POLICE STATIONS ──────────────────────────────────────────────────
        station_data = [
            {"name": "One Town Police Station",    "mobile": "9500001111", "latitude": 16.5074, "longitude": 80.6480, "city": "Vijayawada", "station_code": "AP-PS-VJA-OT"},
            {"name": "Governorpet Police Station", "mobile": "9500002222", "latitude": 16.5048, "longitude": 80.6365, "city": "Vijayawada", "station_code": "AP-PS-VJA-GP"},
            {"name": "Labbipet Police Station",    "mobile": "9500003333", "latitude": 16.5110, "longitude": 80.6320, "city": "Vijayawada", "station_code": "AP-PS-VJA-LP"},
        ]
        stations = []
        for s in station_data:
            station = PoliceStation(
                name=s["name"], mobile=s["mobile"], password=None,
                latitude=s["latitude"], longitude=s["longitude"],
                city=s["city"], state="Andhra Pradesh",
                station_code=s["station_code"],
                address=f"{s['name']}, {s['city']}, Andhra Pradesh",
                is_active=True, is_available=True, mobile_verified=True,
            )
            db.add(station)
            db.flush()
            stations.append(station)
            print(f"  Police Station: {station.name} | Mobile: {s['mobile']}")

        # ─── POLICEMEN ────────────────────────────────────────────────────────
        police_data = [
            {"name": "Constable Raju Reddy",   "mobile": "9600001111", "badge_number": "AP-12345"},
            {"name": "SI Venkata Rao",          "mobile": "9600002222", "badge_number": "AP-12346"},
            {"name": "Constable Lakshmi Devi",  "mobile": "9600003333", "badge_number": "AP-12347"},
        ]
        for i, p in enumerate(police_data):
            db.add(Policeman(
                name=p["name"], mobile=p["mobile"], password=None,
                badge_number=p["badge_number"],
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                station_id=stations[i % len(stations)].id if stations else None,
                is_active=True, is_available=True, mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print(f"  Policeman: {p['name']} | Mobile: {p['mobile']}")

        # ─── MECHANICS ────────────────────────────────────────────────────────
        mechanic_data = [
            {"name": "Rajesh Mechanics",      "mobile": "9700001111", "specialization": "Car, Motorcycle"},
            {"name": "Quick Fix Auto Works",  "mobile": "9700002222", "specialization": "All vehicles"},
            {"name": "Vijay Auto Garage",     "mobile": "9700003333", "specialization": "Heavy vehicles, Trucks"},
        ]
        for m in mechanic_data:
            db.add(Mechanic(
                name=m["name"], mobile=m["mobile"], password=None,
                specialization=m["specialization"],
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                is_active=True, is_available=True, mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print(f"  Mechanic: {m['name']} | Mobile: {m['mobile']}")

        # ─── INSURANCE COMPANIES ──────────────────────────────────────────────
        insurance_data = [
            {"name": "Safe Drive Insurance",  "mobile": "9800001111", "license": "IRDAI-AP-123456"},
            {"name": "NighaTech Insure Co.",  "mobile": "9800002222", "license": "IRDAI-AP-123457"},
            {"name": "AP Road Shield",        "mobile": "9800003333", "license": "IRDAI-AP-123458"},
        ]
        for ins in insurance_data:
            db.add(InsuranceCompany(
                name=ins["name"], mobile=ins["mobile"], password=None,
                license_number=ins["license"],
                latitude=random_offset(VIJAYAWADA_BASE["lat"]),
                longitude=random_offset(VIJAYAWADA_BASE["lng"]),
                city="Vijayawada",
                address="MG Road, Vijayawada, Andhra Pradesh",
                is_active=True, mobile_verified=True,
            ))
            print(f"  Insurance: {ins['name']} | Mobile: {ins['mobile']}")

        # ─── VOLUNTEERS ───────────────────────────────────────────────────────
        volunteer_data = [
            {"name": "Ramesh Volunteer",      "mobile": "9900001111", "lat": 16.5061, "lng": 80.6482},
            {"name": "Priya AB Volunteer",    "mobile": "9900002222", "lat": 16.5080, "lng": 80.6470},
            {"name": "Suresh First Responder","mobile": "9900003333", "lat": 16.5040, "lng": 80.6490},
        ]
        for v in volunteer_data:
            db.add(User(
                full_name=v["name"], mobile=v["mobile"], role="volunteer",
                last_location_lat=v["lat"], last_location_lng=v["lng"],
                is_active=True, is_available=True, mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print(f"  Volunteer: {v['name']} | Mobile: {v['mobile']}")

        # ─── FIRE DEPARTMENT ──────────────────────────────────────────────────
        fire_data = [
            {"name": "Vijayawada Central Fire Station", "mobile": "9100001111", "lat": 16.5065, "lng": 80.6478},
            {"name": "Benz Circle Fire Unit",           "mobile": "9100002222", "lat": 16.5100, "lng": 80.6500},
            {"name": "Governorpet Fire Rescue",         "mobile": "9100003333", "lat": 16.5045, "lng": 80.6360},
        ]
        for f in fire_data:
            db.add(User(
                full_name=f["name"], mobile=f["mobile"], role="fire_department",
                last_location_lat=f["lat"], last_location_lng=f["lng"],
                is_active=True, is_available=True, mobile_verified=True,
                last_seen=datetime.datetime.utcnow()
            ))
            print(f"  Fire Dept: {f['name']} | Mobile: {f['mobile']}")

        db.commit()

        print("\n" + "=" * 55)
        print("  ✅ SEED DATA LOADED SUCCESSFULLY")
        print("=" * 55)
        print("\nAll logins use: Mobile Number + OTP")
        print("\n📋 Test Mobile Numbers:")
        print("  🏥 Hospital:       9300001111 / 9300002222 / 9300003333")
        print("  🚑 Ambulance:      9400001111 / 9400002222 / 9400003333")
        print("  🚔 Police Station: 9500001111 / 9500002222 / 9500003333")
        print("  👮 Policeman:      9600001111 / 9600002222 / 9600003333")
        print("  🔧 Mechanic:       9700001111 / 9700002222 / 9700003333")
        print("  🛡️  Insurance:      9800001111 / 9800002222 / 9800003333")
        print("  🤝 Volunteer:      9900001111 / 9900002222 / 9900003333")
        print("  🔥 Fire Dept:      9100001111 / 9100002222 / 9100003333")
        print("=" * 55)

    except Exception as e:
        db.rollback()
        print(f"❌ Seed error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if standalone:
            db.close()


def auto_seed_if_empty():
    """
    Called on app startup — seeds the database only if it is completely empty.
    This ensures fresh Railway SQLite deployments always have test data.
    """
    try:
        from app import SessionLocal, Hospital
        db = SessionLocal()
        count = db.query(Hospital).count()
        db.close()
        if count == 0:
            print("📦 [AutoSeed] Database is empty — seeding test data...")
            seed()
            print("📦 [AutoSeed] Done.")
        else:
            print(f"📦 [AutoSeed] Database already has {count} hospitals — skipping seed.")
    except Exception as e:
        print(f"⚠️ [AutoSeed] Could not run auto-seed: {e}")


if __name__ == "__main__":
    seed()
