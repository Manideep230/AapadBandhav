import socketio
import time
import requests

sio = socketio.Client()

received_events = []

@sio.event
def connect():
    print("Socket connected! ID:", sio.sid)
    # Register as volunteer
    registration_data = {
        "entityId": "1de9fe3c-15ae-4f1d-830d-39ab0e5742f1",
        "entityType": "volunteer"
    }
    print("Emitting entity:register:", registration_data)
    sio.emit("entity:register", registration_data)

@sio.on("entity:registered")
def on_registered(data):
    print("Registration confirmed by server:", data)

@sio.on("alert:new")
def on_alert_new(data):
    print("SUCCESS: Received alert:new event! Data:", data)
    received_events.append(("alert:new", data))

@sio.on("entity:1de9fe3c-15ae-4f1d-830d-39ab0e5742f1:alert")
def on_personal_alert(data):
    print("SUCCESS: Received personal alert event! Data:", data)
    received_events.append(("personal_alert", data))

@sio.event
def disconnect():
    print("Disconnected from server")

try:
    # 1. Connect socket with Origin header to pass CORS checks
    sio.connect("http://127.0.0.1:5000", headers={"Origin": "http://127.0.0.1:3000"})
    time.sleep(1)
    
    # 2. Get OTP
    print("Requesting OTP for citizen Shang (9381088104)...")
    res_otp = requests.post("http://localhost:5000/api/auth/otp/send", json={"mobile": "9381088104"})
    print("OTP response:", res_otp.json())
    otp = res_otp.json().get("otp")
    
    # 3. Verify OTP and login
    print(f"Logging in with OTP {otp}...")
    res_login = requests.post("http://localhost:5000/api/auth/otp/verify", json={"mobile": "9381088104", "otp": otp})
    token = res_login.json().get("token")
    print("Logged in successfully! Token received.")
    
    # 4. Trigger accident
    headers = {"Authorization": f"Bearer {token}"}
    accident_payload = {
        "latitude": 16.5182,
        "longitude": 80.6325,
        "severity": "critical",
        "description": "E2E Emitter Test Accident",
        "speed_at_impact": 55.0
    }
    print("Triggering accident via REST...")
    res_trigger = requests.post("http://localhost:5000/api/accidents/trigger", json=accident_payload, headers=headers)
    print("Accident trigger response:", res_trigger.json())
    
    # 5. Wait for alert to arrive
    print("Waiting 10 seconds for Socket.IO alerts to arrive...")
    time.sleep(10)
    
    print("=== SUMMARY ===")
    print(f"Received events count: {len(received_events)}")
    for ev_type, data in received_events:
        print(f"- {ev_type}: {data}")
        
finally:
    if sio.connected:
        sio.disconnect()
