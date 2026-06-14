import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import SessionLocal, Accident, Alert, User, Hospital, AmbulanceDriver, PoliceStation, Policeman, Mechanic, InsuranceCompany

db = SessionLocal()
try:
    print("=== ACCIDENTS IN DB ===")
    accidents = db.query(Accident).order_by(Accident.created_at.desc()).limit(5).all()
    for acc in accidents:
        print(f"ID: {acc.id} | Code: {acc.accident_code} | Lat/Lng: {acc.latitude}, {acc.longitude} | Status: {acc.status} | Created At: {acc.created_at}")
        
    print("\n=== ALERTS IN DB ===")
    alerts = db.query(Alert).order_by(Alert.created_at.desc()).limit(10).all()
    for alert in alerts:
        print(f"ID: {alert.id} | Accident ID: {alert.accident_id} | Recipient ID: {alert.recipient_id} | Recipient Type: {alert.recipient_type} | Message: {alert.message} | Status: {alert.status}")

    print("\n=== ACTIVE & AVAILABLE HOSPITALS ===")
    hospitals = db.query(Hospital).all()
    for h in hospitals:
        print(f"Name: {h.name} | Active: {h.is_active} | Available: {h.is_available} | Lat/Lng: {h.latitude}, {h.longitude}")

    print("\n=== ACTIVE & AVAILABLE AMBULANCES ===")
    ambulances = db.query(AmbulanceDriver).all()
    for a in ambulances:
        print(f"Name: {a.name} | Active: {a.is_active} | Available: {a.is_available} | Lat/Lng: {a.latitude}, {a.longitude}")

    print("\n=== ACTIVE & AVAILABLE POLICEMEN ===")
    policemen = db.query(Policeman).all()
    for p in policemen:
        print(f"Name: {p.name} | Active: {p.is_active} | Available: {p.is_available} | Lat/Lng: {p.latitude}, {p.longitude}")

    print("\n=== ACTIVE & AVAILABLE VOLUNTEERS ===")
    vols = db.query(User).filter(User.role == 'volunteer').all()
    for v in vols:
        print(f"Name: {v.full_name} | Active: {v.is_active} | Available: {v.is_available} | Lat/Lng: {v.last_location_lat}, {v.last_location_lng}")

finally:
    db.close()
