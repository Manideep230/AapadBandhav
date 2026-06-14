import os
import sys
from dotenv import load_dotenv
load_dotenv()

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from src.config.db import DB_DIALECT

def remove_end_users():
    if DB_DIALECT == "mongodb":
        from pymongo import MongoClient
        mongo_uri = os.getenv("MONGODB_URI", "mongodb+srv://manideep:manideep@cluster0.rtoosny.mongodb.net/")
        client = MongoClient(mongo_uri)
        db = client["aapadbandhav"]

        print("Removing end users from MongoDB...")
        # Find all users who are not admin or superadmin
        end_users = list(db.users.find({"role": {"$nin": ["admin", "superadmin"]}}))
        end_user_ids = [u["id"] for u in end_users]

        print(f"Found {len(end_users)} end users to remove.")
        if not end_users:
            print("No end users to remove.")
            return

        # Cascade deletes
        res = db.emergency_contacts.delete_many({"user_id": {"$in": end_user_ids}})
        print(f"Deleted {res.deleted_count} emergency contacts.")

        res = db.vehicle_information.delete_many({"user_id": {"$in": end_user_ids}})
        print(f"Deleted {res.deleted_count} vehicle information records.")

        res = db.insurance_customers.delete_many({"user_id": {"$in": end_user_ids}})
        print(f"Deleted {res.deleted_count} insurance customers.")

        res = db.device_shares.delete_many({"user_id": {"$in": end_user_ids}})
        print(f"Deleted {res.deleted_count} device shares.")

        res = db.notifications.delete_many({"user_id": {"$in": end_user_ids}})
        print(f"Deleted {res.deleted_count} notifications.")

        # Unlink devices
        res = db.devices.update_many(
            {"owner_id": {"$in": end_user_ids}},
            {"$set": {"owner_id": None, "is_linked": False, "linked_at": None, "status": "inactive"}}
        )
        print(f"Unlinked {res.modified_count} devices.")

        # Nullify user_id on accidents
        res = db.accidents.update_many(
            {"user_id": {"$in": end_user_ids}},
            {"$set": {"user_id": None}}
        )
        print(f"Updated {res.modified_count} accidents.")

        # Delete users
        res = db.users.delete_many({"role": {"$nin": ["admin", "superadmin"]}})
        print(f"Deleted {res.deleted_count} end users.")

    else:
        # SQL-based deletion using SQLAlchemy
        from src.config.db import SessionLocal
        from src.models.models import (
            User, Device, EmergencyContact, VehicleInformation, DeviceShare, Notification, Accident, InsuranceCustomer
        )
        db = SessionLocal()
        try:
            print(f"Removing end users from SQL Database ({DB_DIALECT})...")
            end_users = db.query(User).filter(~User.role.in_(["admin", "superadmin"])).all()
            end_user_ids = [u.id for u in end_users]

            print(f"Found {len(end_users)} end users to remove.")
            if not end_users:
                print("No end users to remove.")
                return

            # Delete related records
            db.query(EmergencyContact).filter(EmergencyContact.user_id.in_(end_user_ids)).delete(synchronize_session=False)
            db.query(VehicleInformation).filter(VehicleInformation.user_id.in_(end_user_ids)).delete(synchronize_session=False)
            db.query(InsuranceCustomer).filter(InsuranceCustomer.user_id.in_(end_user_ids)).delete(synchronize_session=False)
            db.query(DeviceShare).filter(DeviceShare.user_id.in_(end_user_ids)).delete(synchronize_session=False)
            db.query(Notification).filter(Notification.user_id.in_(end_user_ids)).delete(synchronize_session=False)

            # Unlink devices
            db.query(Device).filter(Device.owner_id.in_(end_user_ids)).update(
                {Device.owner_id: None, Device.is_linked: False, Device.linked_at: None, Device.status: "inactive"},
                synchronize_session=False
            )

            # Nullify user_id on accidents
            db.query(Accident).filter(Accident.user_id.in_(end_user_ids)).update(
                {Accident.user_id: None},
                synchronize_session=False
            )

            # Delete users
            db.query(User).filter(~User.role.in_(["admin", "superadmin"])).delete(synchronize_session=False)
            db.commit()
            print(f"Deleted {len(end_users)} end users and their associated records successfully.")
        except Exception as e:
            db.rollback()
            print(f"Error during SQL deletion: {e}")
            raise
        finally:
            db.close()

if __name__ == "__main__":
    remove_end_users()
