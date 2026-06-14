import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import SessionLocal, Accident, User
from app import run_phase_dispatch

db = SessionLocal()
try:
    # Get the latest accident
    acc = db.query(Accident).order_by(Accident.created_at.desc()).first()
    if acc:
        print(f"Testing phase dispatch for Accident {acc.accident_code} ({acc.id})")
        # Temporarily change status to 'active' so run_phase_dispatch will run
        acc.status = 'active'
        db.commit()
        
        # Run dispatch in foreground
        run_phase_dispatch(acc.id, 8, 1)
    else:
        print("No accidents found in database to test.")
finally:
    db.close()
