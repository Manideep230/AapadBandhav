import socketio
import time
import requests

sio = socketio.Client()

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

@sio.on("entity:1de9fe3c-15ae-4f1d-830d-39ab0e5742f1:alert")
def on_personal_alert(data):
    print("SUCCESS: Received personal alert event! Data:", data)

@sio.event
def disconnect():
    print("Disconnected from server")

try:
    sio.connect("http://127.0.0.1:5000")
    print("Waiting for alerts... (will trigger one in 2 seconds)")
    time.sleep(2)
    
    # Let's trigger a test alert using a REST call if needed, or by running our trigger_test.py
    # Since we can just run trigger_test.py in another process or trigger it via HTTP POST.
    # Let's use requests to trigger it!
    # First, let's login or use a test endpoint. Or we can just trigger it by executing trigger_test.py.
    import subprocess
    print("Launching trigger_test.py to generate alert...")
    subprocess.run(["python", "trigger_test.py"])
    
    # Wait for alert to arrive
    time.sleep(5)
finally:
    if sio.connected:
        sio.disconnect()
