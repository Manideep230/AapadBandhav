# -*- coding: utf-8 -*-
# OpenAPI 3.0 specification for AapadBandhav API

openapi_spec = {
    "openapi": "3.0.0",
    "info": {
        "title": "AapadBandhav API",
        "version": "2.0.0",
        "description": "Enterprise API Documentation for the AapadBandhav Platform. Designed for Vehicle Owners, Police, Admin Staff, IoT Engineers, and Business Users. Features interactive testing with JWT bearer token support. Restricted to Admins only."
    },
    "servers": [
        {"url": "/", "description": "Relative server URL"}
    ],
    "components": {
        "securitySchemes": {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Enter your JWT token in the format: <token_value>. Do NOT include 'Bearer ' prefix."
            }
        },
        "schemas": {
            "ErrorResponse": {
                "type": "object",
                "properties": {
                    "success": {"type": "boolean", "example": False},
                    "message": {"type": "string", "example": "Something went wrong"}
                }
            },
            "OTPRequest": {
                "type": "object",
                "required": ["mobile"],
                "properties": {
                    "mobile": {"type": "string", "example": "9999999999"}
                }
            },
            "OTPVerify": {
                "type": "object",
                "required": ["mobile", "otp"],
                "properties": {
                    "mobile": {"type": "string", "example": "9999999999"},
                    "otp": {"type": "string", "example": "123456"},
                    "role": {"type": "string", "example": "admin", "description": "Optional preferred role hint"}
                }
            },
            "OTPRegister": {
                "type": "object",
                "required": ["full_name", "mobile", "otp"],
                "properties": {
                    "full_name": {"type": "string", "example": "Rahul Kumar"},
                    "mobile": {"type": "string", "example": "9876543210"},
                    "otp": {"type": "string", "example": "123456"},
                    "email": {"type": "string", "example": "rahul@example.com"},
                    "age": {"type": "integer", "example": 28},
                    "gender": {"type": "string", "example": "Male"},
                    "blood_group": {"type": "string", "example": "O+"},
                    "address": {"type": "string", "example": "Vijayawada, AP"}
                }
            },
            "UserProfile": {
                "type": "object",
                "properties": {
                    "full_name": {"type": "string", "example": "Rahul Kumar"},
                    "email": {"type": "string", "example": "rahul@example.com"},
                    "age": {"type": "integer", "example": 28},
                    "gender": {"type": "string", "example": "Male"},
                    "blood_group": {"type": "string", "example": "O+"},
                    "address": {"type": "string", "example": "Vijayawada, AP"},
                    "vehicle_number": {"type": "string", "example": "AP16AB1234"},
                    "vehicle_type": {"type": "string", "example": "Car"}
                }
            },
            "EmergencyContact": {
                "type": "object",
                "required": ["name", "mobile", "relation"],
                "properties": {
                    "name": {"type": "string", "example": "Suresh Kumar"},
                    "mobile": {"type": "string", "example": "9876543211"},
                    "relation": {"type": "string", "example": "Father"}
                }
            },
            "DeviceRegisterQR": {
                "type": "object",
                "required": ["deviceCode", "vehicle_number", "vehicle_type"],
                "properties": {
                    "deviceCode": {"type": "string", "example": "1234567890123456", "description": "16-digit device ID"},
                    "vehicle_number": {"type": "string", "example": "AP16AB1234"},
                    "vehicle_type": {"type": "string", "example": "Car"}
                }
            },
            "DeviceShare": {
                "type": "object",
                "required": ["device_id", "share_with_id"],
                "properties": {
                    "device_id": {"type": "string", "example": "device-uuid-123"},
                    "share_with_id": {"type": "string", "example": "AB-XYZ123", "description": "AapadBandhav Unique ID of user to share with"}
                }
            },
            "DeviceUnshare": {
                "type": "object",
                "required": ["device_id", "user_id"],
                "properties": {
                    "device_id": {"type": "string", "example": "device-uuid-123"},
                    "user_id": {"type": "string", "example": "user-uuid-456"}
                }
            },
            "AccidentTrigger": {
                "type": "object",
                "required": ["latitude", "longitude"],
                "properties": {
                    "latitude": {"type": "number", "example": 16.506},
                    "longitude": {"type": "number", "example": 80.648},
                    "severity": {"type": "string", "example": "high", "enum": ["low", "medium", "high", "critical"]},
                    "description": {"type": "string", "example": "Rollover collision detected"}
                }
            },
            "LocationUpdate": {
                "type": "object",
                "required": ["latitude", "longitude"],
                "properties": {
                    "latitude": {"type": "number", "example": 16.506},
                    "longitude": {"type": "number", "example": 80.648},
                    "speed": {"type": "number", "example": 45.5},
                    "heading": {"type": "number", "example": 180.0}
                }
            },
            "StatusUpdate": {
                "type": "object",
                "required": ["status"],
                "properties": {
                    "status": {"type": "string", "example": "online", "enum": ["online", "offline"]}
                }
            },
            "AvailabilityUpdate": {
                "type": "object",
                "required": ["is_available"],
                "properties": {
                    "is_available": {"type": "boolean", "example": True}
                }
            },
            "BedsUpdate": {
                "type": "object",
                "required": ["total_beds", "available_beds"],
                "properties": {
                    "total_beds": {"type": "integer", "example": 100},
                    "available_beds": {"type": "integer", "example": 42}
                }
            },
            "DeviceStatusUpdate": {
                "type": "object",
                "required": ["status"],
                "properties": {
                    "status": {"type": "string", "example": "active", "enum": ["active", "inactive"]}
                }
            },
            "BulkDeviceGenerate": {
                "type": "object",
                "required": ["count"],
                "properties": {
                    "count": {"type": "integer", "example": 10}
                }
            },
            "LinkInsuranceCustomer": {
                "type": "object",
                "required": ["user_mobile"],
                "properties": {
                    "user_mobile": {"type": "string", "example": "9876543210"}
                }
            },
            "AdminRegisterService": {
                "type": "object",
                "required": ["role", "name", "mobile"],
                "properties": {
                    "role": {"type": "string", "enum": ["hospital", "ambulance", "police_station", "policeman", "mechanic", "insurance"], "example": "hospital"},
                    "name": {"type": "string", "example": "Metro Trauma Care"},
                    "mobile": {"type": "string", "example": "9900112233"},
                    "email": {"type": "string", "example": "metro@hospital.in"},
                    "latitude": {"type": "number", "example": 16.508},
                    "longitude": {"type": "number", "example": 80.642},
                    "bed_capacity": {"type": "integer", "example": 80},
                    "specializations": {"type": "array", "items": {"type": "string"}, "example": ["Trauma", "Surgery"]},
                    "registration_number": {"type": "string", "example": "REG-88992"},
                    "city": {"type": "string", "example": "Vijayawada"},
                    "state": {"type": "string", "example": "AP"}
                }
            },
            "AdminCreateUserAccount": {
                "type": "object",
                "required": ["role", "name", "mobile"],
                "properties": {
                    "role": {"type": "string", "enum": ["volunteer", "fire_department", "emergency_personnel"], "example": "volunteer"},
                    "name": {"type": "string", "example": "Suresh Babu"},
                    "mobile": {"type": "string", "example": "9988445566"},
                    "email": {"type": "string", "example": "suresh@volunteer.org"},
                    "address": {"type": "string", "example": "Vijayawada, AP"},
                    "department": {"type": "string", "example": "Rescue Ops"},
                    "rank": {"type": "string", "example": "Senior Responder"}
                }
            },
            "AdminCreateUpdate": {
                "type": "object",
                "required": ["name", "mobile"],
                "properties": {
                    "name": {"type": "string", "example": "Ramesh Patel"},
                    "mobile": {"type": "string", "example": "9988776655"},
                    "email": {"type": "string", "example": "ramesh@aapadbandhav.in"},
                    "role": {"type": "string", "enum": ["admin", "superadmin"], "example": "admin"},
                    "permissions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "example": ["manage_users", "manage_devices"]
                    }
                }
            }
        }
    },
    "security": [],
    "paths": {
        # --- Authentication ---
        "/api/auth/otp/send": {
            "post": {
                "tags": ["Authentication"],
                "summary": "Send OTP to mobile",
                "description": "Generates a 6-digit OTP and sends it via SMS. Returns the code directly in development.",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/OTPRequest"}}}
                },
                "responses": {
                    "200": {"description": "OTP sent successfully"},
                    "422": {"description": "Validation failed"},
                    "429": {"description": "Rate limited"}
                }
            }
        },
        "/api/auth/otp/verify": {
            "post": {
                "tags": ["Authentication"],
                "summary": "Verify OTP & Authenticate",
                "description": "Verifies the OTP. Returns a JWT Bearer token and user roles on success.",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/OTPVerify"}}}
                },
                "responses": {
                    "200": {"description": "Authentication successful"},
                    "400": {"description": "Invalid OTP"},
                    "403": {"description": "Account deactivated"}
                }
            }
        },
        "/api/auth/otp/register": {
            "post": {
                "tags": ["Authentication"],
                "summary": "Register Citizen via OTP",
                "description": "Creates a new citizen profile after verifying the mobile OTP.",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/OTPRegister"}}}
                },
                "responses": {
                    "201": {"description": "Registered successfully"},
                    "400": {"description": "Registration details invalid"},
                    "409": {"description": "Mobile number already exists"}
                }
            }
        },
        "/api/auth/me": {
            "get": {
                "tags": ["Authentication"],
                "summary": "Get current session profile",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Profile data"},
                    "401": {"description": "Unauthorized"}
                }
            }
        },
        # --- Profiles & Contacts ---
        "/api/users/profile": {
            "get": {
                "tags": ["Profile"],
                "summary": "Get citizen profile",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Profile retrieved successfully"}
                }
            },
            "put": {
                "tags": ["Profile"],
                "summary": "Update citizen profile",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/UserProfile"}}}
                },
                "responses": {
                    "200": {"description": "Profile updated successfully"}
                }
            }
        },
        "/api/profile": {
            "get": {
                "tags": ["Profile"],
                "summary": "Get generic user profile",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Generic profile retrieved"}
                }
            },
            "put": {
                "tags": ["Profile"],
                "summary": "Update generic user profile",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object"}}}
                },
                "responses": {
                    "200": {"description": "Profile updated"}
                }
            }
        },
        "/api/users/emergency-contacts": {
            "get": {
                "tags": ["Profile"],
                "summary": "Get list of emergency contacts",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "List of emergency contacts"}
                }
            },
            "post": {
                "tags": ["Profile"],
                "summary": "Create emergency contact",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/EmergencyContact"}}}
                },
                "responses": {
                    "201": {"description": "Contact created successfully"},
                    "400": {"description": "Invalid payload"}
                }
            }
        },
        "/api/users/emergency-contacts/{id}": {
            "put": {
                "tags": ["Profile"],
                "summary": "Update emergency contact",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/EmergencyContact"}}}
                },
                "responses": {
                    "200": {"description": "Updated successfully"},
                    "404": {"description": "Contact not found"}
                }
            },
            "delete": {
                "tags": ["Profile"],
                "summary": "Delete emergency contact",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Deleted successfully"},
                    "404": {"description": "Contact not found"}
                }
            }
        },
        # --- Devices ---
        "/api/devices/register-qr": {
            "post": {
                "tags": ["Devices"],
                "summary": "Register device via 16-digit QR Code",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/DeviceRegisterQR"}}}
                },
                "responses": {
                    "201": {"description": "Linked and registered successfully"},
                    "422": {"description": "Invalid device code or error"}
                }
            }
        },
        "/api/devices/my-devices": {
            "get": {
                "tags": ["Devices"],
                "summary": "Get my devices",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Returns owned and shared devices list"}
                }
            }
        },
        "/api/devices/my-device": {
            "get": {
                "tags": ["Devices"],
                "summary": "Get current primary device info",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Primary device"}
                }
            }
        },
        "/api/devices/link": {
            "post": {
                "tags": ["Devices"],
                "summary": "Link device to user",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "required": ["device_id"], "properties": {"device_id": {"type": "string"}}}}}
                },
                "responses": {
                    "200": {"description": "Linked successfully"}
                }
            }
        },
        "/api/devices/unlink": {
            "post": {
                "tags": ["Devices"],
                "summary": "Unlink device from user",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "required": ["device_id"], "properties": {"device_id": {"type": "string"}}}}}
                },
                "responses": {
                    "200": {"description": "Unlinked successfully"}
                }
            }
        },
        "/api/devices/location/update": {
            "post": {
                "tags": ["Devices"],
                "summary": "Update live GPS location of a specific linked device",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["device_id", "latitude", "longitude"],
                                "properties": {
                                    "device_id": {"type": "string", "description": "16-digit device ID"},
                                    "latitude": {"type": "number", "format": "float", "description": "Device latitude"},
                                    "longitude": {"type": "number", "format": "float", "description": "Device longitude"},
                                    "speed": {"type": "number", "format": "float", "description": "Current speed in km/h"},
                                    "heading": {"type": "number", "format": "float", "description": "Compass heading in degrees"},
                                    "accuracy": {"type": "number", "format": "float", "description": "Accuracy in meters"},
                                    "battery_level": {"type": "integer", "description": "Device battery level percentage (0-100)"}
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Device location updated successfully"},
                    "403": {"description": "Access denied for this device"},
                    "404": {"description": "Device not found"},
                    "422": {"description": "Validation error"}
                }
            }
        },
        "/api/devices/locate": {
            "post": {
                "tags": ["Devices"],
                "summary": "Retrieve latest location of a specific device",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["device_id"],
                                "properties": {
                                    "device_id": {"type": "string", "description": "16-digit device ID or device code"}
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "Device location retrieved successfully",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "success": {"type": "boolean"},
                                        "device_id": {"type": "string"},
                                        "latitude": {"type": "number", "format": "float"},
                                        "longitude": {"type": "number", "format": "float"},
                                        "speed": {"type": "number", "format": "float"},
                                        "heading": {"type": "number", "format": "float"},
                                        "accuracy": {"type": "number", "format": "float"},
                                        "recorded_at": {"type": "string", "format": "date-time"},
                                        "battery_level": {"type": "integer"},
                                        "status": {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "403": {"description": "Access denied for this device"},
                    "404": {"description": "Device not found"},
                    "422": {"description": "Validation error"}
                }
            },
            "get": {
                "tags": ["Devices"],
                "summary": "Retrieve latest location of a specific device",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "device_id", "in": "query", "required": True, "schema": {"type": "string"}, "description": "16-digit device ID or device code"}
                ],
                "responses": {
                    "200": {
                        "description": "Device location retrieved successfully",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "success": {"type": "boolean"},
                                        "device_id": {"type": "string"},
                                        "latitude": {"type": "number", "format": "float"},
                                        "longitude": {"type": "number", "format": "float"},
                                        "speed": {"type": "number", "format": "float"},
                                        "heading": {"type": "number", "format": "float"},
                                        "accuracy": {"type": "number", "format": "float"},
                                        "recorded_at": {"type": "string", "format": "date-time"},
                                        "battery_level": {"type": "integer"},
                                        "status": {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "403": {"description": "Access denied for this device"},
                    "404": {"description": "Device not found"},
                    "422": {"description": "Validation error"}
                }
            }
        },
        "/api/devices/share": {
            "post": {
                "tags": ["Devices"],
                "summary": "Share device with a family member",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/DeviceShare"}}}
                },
                "responses": {
                    "201": {"description": "Shared successfully"},
                    "404": {"description": "User not found"}
                }
            }
        },
        "/api/devices/unshare": {
            "post": {
                "tags": ["Devices"],
                "summary": "Stop sharing device",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/DeviceUnshare"}}}
                },
                "responses": {
                    "200": {"description": "Revoked share successfully"}
                }
            }
        },
        "/api/devices/shares/{device_id}": {
            "get": {
                "tags": ["Devices"],
                "summary": "List users sharing this device",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "device_id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Shares list"}
                }
            }
        },
        "/api/devices/validate-qr": {
            "post": {
                "tags": ["Devices"],
                "summary": "Validate a QR code payload or device ID",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "qrCode": {"type": "string"},
                                    "deviceId": {"type": "string"}
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Device is valid and available for registration"},
                    "404": {"description": "Device not found"},
                    "409": {"description": "Device already linked"}
                }
            }
        },
        "/api/devices/register-by-qr": {
            "post": {
                "tags": ["Devices"],
                "summary": "Register/Link a device via QR code payload",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["qrCode", "vehicle_number"],
                                "properties": {
                                    "qrCode": {"type": "string"},
                                    "deviceId": {"type": "string"},
                                    "vehicle_type": {"type": "string"},
                                    "vehicle_number": {"type": "string"},
                                    "vehicle_model": {"type": "string"},
                                    "manufacturer": {"type": "string"},
                                    "year": {"type": "integer"}
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "201": {"description": "Device registered and vehicle details linked successfully"},
                    "409": {"description": "Device already linked"}
                }
            }
        },
        "/api/devices/{deviceId}/share": {
            "post": {
                "tags": ["Devices"],
                "summary": "Share device access with another user by AapadBandhav ID",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "deviceId", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["share_with_id"],
                                "properties": {
                                    "share_with_id": {"type": "string"}
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "201": {"description": "Shared successfully"},
                    "404": {"description": "User or Device not found"}
                }
            }
        },
        "/api/devices/{deviceId}/shared-user/{userId}": {
            "delete": {
                "tags": ["Devices"],
                "summary": "Revoke device sharing access",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "deviceId", "in": "path", "required": True, "schema": {"type": "string"}},
                    {"name": "userId", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Device sharing access revoked successfully"},
                    "404": {"description": "Device or sharing record not found"}
                }
            }
        },
        "/api/devices/{deviceId}/owner": {
            "get": {
                "tags": ["Devices"],
                "summary": "Retrieve owner information for a device",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "deviceId", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Device owner details"},
                    "403": {"description": "Access denied"},
                    "404": {"description": "Device or owner not found"}
                }
            }
        },
        "/api/devices/{deviceId}/shared-users": {
            "get": {
                "tags": ["Devices"],
                "summary": "Retrieve list of users this device is shared with",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "deviceId", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "List of shared users"},
                    "403": {"description": "Access denied"}
                }
            }
        },
        "/api/devices/my-accessible-devices": {
            "get": {
                "tags": ["Devices"],
                "summary": "Get list of all devices the current user has access to (owned + shared)",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Returns list of accessible devices"}
                }
            }
        },
        "/api/live-map/my-devices": {
            "get": {
                "tags": ["Devices"],
                "summary": "Get live location tracking data for all accessible devices",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Returns live location records"}
                }
            }
        },
        "/api/admin/devices/bulk-activate": {
            "post": {
                "tags": ["Admin Devices"],
                "summary": "Bulk activate devices",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["deviceIds"],
                                "properties": {
                                    "deviceIds": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Successfully activated devices"}
                }
            }
        },
        "/api/admin/devices/bulk-deactivate": {
            "post": {
                "tags": ["Admin Devices"],
                "summary": "Bulk deactivate devices",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["deviceIds"],
                                "properties": {
                                    "deviceIds": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Successfully deactivated devices"}
                }
            }
        },
        "/api/admin/devices/bulk-delete": {
            "post": {
                "tags": ["Admin Devices"],
                "summary": "Bulk delete devices",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["deviceIds"],
                                "properties": {
                                    "deviceIds": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Successfully deleted devices"}
                }
            }
        },
        "/api/admin/devices/bulk-export": {
            "post": {
                "tags": ["Admin Devices"],
                "summary": "Bulk export devices configuration/status",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "deviceIds": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Returns list of exported device records"}
                }
            }
        },
        "/api/admin/devices/bulk-qr-download": {
            "post": {
                "tags": ["Admin Devices"],
                "summary": "Bulk download/retrieve QR payload structures",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["deviceIds"],
                                "properties": {
                                    "deviceIds": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Returns list of device QR payload structures"}
                }
            }
        },
        # --- Accidents ---
        "/api/accidents/trigger": {
            "post": {
                "tags": ["Accidents"],
                "summary": "Trigger manual emergency/accident report",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AccidentTrigger"}}}
                },
                "responses": {
                    "201": {"description": "Emergency alert triggered and dispatched"}
                }
            }
        },
        "/api/accidents/my": {
            "get": {
                "tags": ["Accidents"],
                "summary": "Get my accidents list",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "List of active/past user accidents"}
                }
            }
        },
        "/api/accidents/{id}": {
            "get": {
                "tags": ["Accidents"],
                "summary": "Get specific accident details",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Accident detail object"}
                }
            }
        },
        "/api/accidents/{id}/cancel": {
            "post": {
                "tags": ["Accidents"],
                "summary": "Cancel accident dispatch",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Accident dispatch cancelled"}
                }
            }
        },
        "/api/accidents/{id}/false-alarm": {
            "post": {
                "tags": ["Accidents"],
                "summary": "Mark accident as false alarm",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Marked as false alarm"}
                }
            }
        },
        "/api/accidents/{id}/resolve": {
            "post": {
                "tags": ["Accidents"],
                "summary": "Resolve active accident",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Accident resolved"}
                }
            }
        },
        "/api/accidents": {
            "get": {
                "tags": ["Accidents"],
                "summary": "List all accidents",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "All accidents"}
                }
            }
        },
        # --- Locations ---
        "/api/locations/update": {
            "post": {
                "tags": ["Locations"],
                "summary": "Update live GPS location",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/LocationUpdate"}}}
                },
                "responses": {
                    "200": {"description": "Location processed successfully"}
                }
            }
        },
        "/api/locations/{entity_type}/{entity_id}": {
            "get": {
                "tags": ["Locations"],
                "summary": "Get latest location of a specific responder/device",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "entity_type", "in": "path", "required": True, "schema": {"type": "string"}},
                    {"name": "entity_id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Latest coordinates and speeds"}
                }
            }
        },
        "/api/locations/active-responders": {
            "get": {
                "tags": ["Locations"],
                "summary": "Get all active emergency responders locations",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Responders geo list"}
                }
            }
        },
        "/api/locations/status": {
            "put": {
                "tags": ["Locations"],
                "summary": "Update active status",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/StatusUpdate"}}}
                },
                "responses": {
                    "200": {"description": "Status updated"}
                }
            }
        },
        # --- Alerts & Responders ---
        "/api/alerts/my-alerts": {
            "get": {
                "tags": ["Responder Alerts"],
                "summary": "Get general active alerts",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Active dispatches"}
                }
            }
        },
        "/api/hospitals/alerts": {
            "get": {
                "tags": ["Responder Alerts"],
                "summary": "Get active hospital alerts",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Hospital dispatch queues"}
                }
            }
        },
        "/api/ambulances/alerts": {
            "get": {
                "tags": ["Responder Alerts"],
                "summary": "Get active ambulance driver alerts",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Ambulance dispatches"}
                }
            }
        },
        "/api/police/station/alerts": {
            "get": {
                "tags": ["Responder Alerts"],
                "summary": "Get active police station alerts",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Police dispatches"}
                }
            }
        },
        "/api/mechanics/alerts": {
            "get": {
                "tags": ["Responder Alerts"],
                "summary": "Get active mechanical dispatch alerts",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Mechanic alerts"}
                }
            }
        },
        "/api/alerts/{id}": {
            "get": {
                "tags": ["Responder Alerts"],
                "summary": "Get detailed alert by ID",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Alert detailed object"}
                }
            }
        },
        "/api/alerts/accident/{accident_id}": {
            "get": {
                "tags": ["Responder Alerts"],
                "summary": "Get alert matching accident code",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "accident_id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Found alert payload"}
                }
            }
        },
        "/api/alerts/{id}/respond": {
            "post": {
                "tags": ["Responder Alerts"],
                "summary": "General responder accept/reject alert",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "required": ["status"], "properties": {"status": {"type": "string", "example": "accepted", "enum": ["accepted", "declined"]}}}}}
                },
                "responses": {
                    "200": {"description": "Action submitted"}
                }
            }
        },
        "/api/hospitals/alerts/{id}/respond": {
            "post": {
                "tags": ["Responder Alerts"],
                "summary": "Hospital accept/reject alert",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "required": ["status"], "properties": {"status": {"type": "string", "example": "accepted"}}}}}
                },
                "responses": {
                    "200": {"description": "Action submitted"}
                }
            }
        },
        "/api/ambulances/alerts/{id}/respond": {
            "post": {
                "tags": ["Responder Alerts"],
                "summary": "Ambulance accept/reject alert",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "required": ["status"], "properties": {"status": {"type": "string", "example": "accepted"}}}}}
                },
                "responses": {
                    "200": {"description": "Action submitted"}
                }
            }
        },
        "/api/police/station/alerts/{id}/respond": {
            "post": {
                "tags": ["Responder Alerts"],
                "summary": "Police station accept/reject alert",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "required": ["status"], "properties": {"status": {"type": "string", "example": "accepted"}}}}}
                },
                "responses": {
                    "200": {"description": "Action submitted"}
                }
            }
        },
        "/api/mechanics/alerts/{id}/respond": {
            "post": {
                "tags": ["Responder Alerts"],
                "summary": "Mechanic accept/reject alert",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "required": ["status"], "properties": {"status": {"type": "string", "example": "accepted"}}}}}
                },
                "responses": {
                    "200": {"description": "Action submitted"}
                }
            }
        },
        "/api/hospitals/availability": {
            "put": {
                "tags": ["Responder Alerts"],
                "summary": "Update Hospital availability toggle",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AvailabilityUpdate"}}}
                },
                "responses": {
                    "200": {"description": "Availability updated"}
                }
            }
        },
        "/api/hospitals/beds": {
            "put": {
                "tags": ["Responder Alerts"],
                "summary": "Update bed capacities",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/BedsUpdate"}}}
                },
                "responses": {
                    "200": {"description": "Beds updated"}
                }
            }
        },
        # --- Insurance ---
        "/api/insurance/customers": {
            "get": {
                "tags": ["Insurance"],
                "summary": "Get list of linked insurance customers",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Linked customers list"}
                }
            }
        },
        "/api/insurance/link-customer": {
            "post": {
                "tags": ["Insurance"],
                "summary": "Link customer mobile to insurance profile",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/LinkInsuranceCustomer"}}}
                },
                "responses": {
                    "201": {"description": "Linked successfully"},
                    "404": {"description": "Customer not found"}
                }
            }
        },
        "/api/insurance/customers/{user_id}": {
            "delete": {
                "tags": ["Insurance"],
                "summary": "Unlink insurance customer",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "user_id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Unlinked successfully"}
                }
            }
        },
        "/api/insurance/alerts": {
            "get": {
                "tags": ["Insurance"],
                "summary": "Get accident claims alerts for insurer",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "List of accident telemetry updates"}
                }
            }
        },
        # --- Notifications ---
        "/api/notifications": {
            "get": {
                "tags": ["Notifications"],
                "summary": "List historical alerts & notifications",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Historical alert array"}
                }
            }
        },
        "/api/notifications/fcm-token": {
            "post": {
                "tags": ["Notifications"],
                "summary": "Register client FCM token for push notifications",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "required": ["token"], "properties": {"token": {"type": "string"}}}}}
                },
                "responses": {
                    "200": {"description": "Token registered"}
                }
            }
        },
        # --- Admin ---
        "/api/admin/dashboard": {
            "get": {
                "tags": ["Admin"],
                "summary": "Get admin dashboard overview details",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Count aggregates"}
                }
            }
        },
        "/api/admin/analytics": {
            "get": {
                "tags": ["Admin"],
                "summary": "Get detailed system analytics graphs data",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Analytics trends"}
                }
            }
        },
        "/api/admin/stats": {
            "get": {
                "tags": ["Admin"],
                "summary": "Get high-level status stats counters",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Stats values"}
                }
            }
        },
        "/api/admin/recent-accidents": {
            "get": {
                "tags": ["Admin"],
                "summary": "Get list of recent accidents",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Recent accidents logs"}
                }
            }
        },
        "/api/admin/accidents": {
            "get": {
                "tags": ["Admin"],
                "summary": "List all accidents in admin context",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Accidents array"}
                }
            }
        },
        "/api/users": {
            "get": {
                "tags": ["Admin Users"],
                "summary": "List users filtered by role",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "role", "in": "query", "required": False, "schema": {"type": "string", "default": "user"}}
                ],
                "responses": {
                    "200": {"description": "Users safety list"}
                }
            }
        },
        "/api/admin/users": {
            "get": {
                "tags": ["Admin Users"],
                "summary": "Search all accounts across roles",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "search", "in": "query", "required": False, "schema": {"type": "string"}},
                    {"name": "limit", "in": "query", "required": False, "schema": {"type": "integer", "default": 50}},
                    {"name": "role", "in": "query", "required": False, "schema": {"type": "string", "default": "all"}}
                ],
                "responses": {
                    "200": {"description": "Searched users array"}
                }
            }
        },
        "/api/admin/services/register": {
            "post": {
                "tags": ["Admin Services"],
                "summary": "Register a new service station/responder account",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AdminRegisterService"}}}
                },
                "responses": {
                    "201": {"description": "Service created successfully"},
                    "409": {"description": "Mobile already exists"},
                    "422": {"description": "Missing parameters"}
                }
            }
        },
        "/api/admin/users/create": {
            "post": {
                "tags": ["Admin Services"],
                "summary": "Register citizen personnel (volunteer, fire, emergency)",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AdminCreateUserAccount"}}}
                },
                "responses": {
                    "201": {"description": "Personnel created"},
                    "409": {"description": "Mobile already exists"},
                    "422": {"description": "Validation failed"}
                }
            }
        },
        "/api/admin/users/{id}/toggle": {
            "put": {
                "tags": ["Admin Users"],
                "summary": "Toggle active state of any user/service",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}},
                    {"name": "role", "in": "query", "required": False, "schema": {"type": "string", "default": "user"}}
                ],
                "responses": {
                    "200": {"description": "State toggled successfully"}
                }
            }
        },
        "/api/admin/users/{id}": {
            "delete": {
                "tags": ["Admin Users"],
                "summary": "Delete user/service profile",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}},
                    {"name": "role", "in": "query", "required": False, "schema": {"type": "string", "default": "user"}}
                ],
                "responses": {
                    "200": {"description": "Deleted successfully"}
                }
            }
        },
        "/api/admin/devices/bulk": {
            "post": {
                "tags": ["Admin Devices"],
                "summary": "Bulk generate IoT hardware records",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/BulkDeviceGenerate"}}}
                },
                "responses": {
                    "201": {"description": "Bulk created successfully"}
                }
            }
        },
        "/api/admin/devices/inventory": {
            "get": {
                "tags": ["Admin Devices"],
                "summary": "Get unassigned devices inventory list",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "search", "in": "query", "required": False, "schema": {"type": "string"}},
                    {"name": "status", "in": "query", "required": False, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Inventory array"}
                }
            }
        },
        "/api/admin/devices/assigned": {
            "get": {
                "tags": ["Admin Devices"],
                "summary": "Get list of active paired devices",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "search", "in": "query", "required": False, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Assigned device array"}
                }
            }
        },
        "/api/admin/devices/{id}/status": {
            "put": {
                "tags": ["Admin Devices"],
                "summary": "Set active status of a device",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/DeviceStatusUpdate"}}}
                },
                "responses": {
                    "200": {"description": "Status updated successfully"},
                    "404": {"description": "Device not found"}
                }
            }
        },
        "/api/admin/devices/{id}": {
            "delete": {
                "tags": ["Admin Devices"],
                "summary": "Delete a device record",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Deleted successfully"},
                    "400": {"description": "Cannot delete linked device"},
                    "404": {"description": "Device not found"}
                }
            }
        },
        "/api/admin/manage/admins": {
            "get": {
                "tags": ["Super Admin Management"],
                "summary": "List all administrative accounts",
                "description": "Returns a list of all active/suspended admins and super-admins in the system.",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Admins list retrieved successfully"}
                }
            },
            "post": {
                "tags": ["Super Admin Management"],
                "summary": "Create new administrative account",
                "description": "Registers a new admin or superadmin account and assigns granular permission scopes.",
                "security": [{"BearerAuth": []}],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AdminCreateUpdate"}}}
                },
                "responses": {
                    "201": {"description": "Admin account created successfully"},
                    "409": {"description": "Mobile number already registered"},
                    "422": {"description": "Validation failed"}
                }
            }
        },
        "/api/admin/manage/admins/{id}": {
            "put": {
                "tags": ["Super Admin Management"],
                "summary": "Modify administrative account",
                "description": "Updates details such as Name, Email, Role, and Permissions for a specific administrator.",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AdminCreateUpdate"}}}
                },
                "responses": {
                    "200": {"description": "Admin account updated successfully"},
                    "400": {"description": "Cannot modify synthetic system admin"},
                    "404": {"description": "Admin account not found"}
                }
            },
            "delete": {
                "tags": ["Super Admin Management"],
                "summary": "Delete administrative account",
                "description": "Permanently deletes an administrator account from the database.",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Admin account deleted successfully"},
                    "400": {"description": "Cannot delete synthetic system admin"},
                    "404": {"description": "Admin account not found"}
                }
            }
        },
        "/api/admin/manage/admins/{id}/toggle": {
            "put": {
                "tags": ["Super Admin Management"],
                "summary": "Toggle active status of administrative account",
                "description": "Suspends or activates an administrator, blocking or restoring their dashboard access.",
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                ],
                "responses": {
                    "200": {"description": "Status toggled successfully"},
                    "400": {"description": "Cannot toggle synthetic system admin"},
                    "404": {"description": "Admin account not found"}
                }
            }
        },
        "/api/admin/manage/logs": {
            "get": {
                "tags": ["Super Admin Management"],
                "summary": "Retrieve security audit trails",
                "description": "Lists the historical logs of administrative activities (logins, creates, updates, status toggles).",
                "security": [{"BearerAuth": []}],
                "responses": {
                    "200": {"description": "Audit trail logs retrieved successfully"}
                }
            }
        },
        # --- Safety ---
        "/api/safety/panic": {
            "post": {
                "tags": ["Safety Playgrounds"],
                "summary": "Panic alert webhook",
                "requestBody": {
                    "required": False,
                    "content": {"application/json": {"schema": {"type": "object"}}}
                },
                "responses": {
                    "200": {"description": "Staged event success"}
                }
            }
        },
        "/api/safety/women-safety": {
            "post": {
                "tags": ["Safety Playgrounds"],
                "summary": "Women safety SOS trigger",
                "requestBody": {
                    "required": False,
                    "content": {"application/json": {"schema": {"type": "object"}}}
                },
                "responses": {
                    "200": {"description": "Staged event success"}
                }
            }
        },
        "/api/safety/shake-detect": {
            "post": {
                "tags": ["Safety Playgrounds"],
                "summary": "Shake trigger alert",
                "requestBody": {
                    "required": False,
                    "content": {"application/json": {"schema": {"type": "object"}}}
                },
                "responses": {
                    "200": {"description": "Staged event success"}
                }
            }
        },
        "/api/safety/audio-record": {
            "post": {
                "tags": ["Safety Playgrounds"],
                "summary": "Emergency audio submission",
                "requestBody": {
                    "required": False,
                    "content": {"application/json": {"schema": {"type": "object"}}}
                },
                "responses": {
                    "200": {"description": "Staged event success"}
                }
            }
        },
        "/api/safety/location-share": {
            "post": {
                "tags": ["Safety Playgrounds"],
                "summary": "Location share session trigger",
                "requestBody": {
                    "required": False,
                    "content": {"application/json": {"schema": {"type": "object"}}}
                },
                "responses": {
                    "200": {"description": "Staged event success"}
                }
            }
        },
        # --- Health ---
        "/api/health": {
            "get": {
                "tags": ["Health Check"],
                "summary": "Health status of services",
                "responses": {
                    "200": {"description": "Healthy"}
                }
            }
        },
        "/health": {
            "get": {
                "tags": ["Health Check"],
                "summary": "Direct health status of services",
                "responses": {
                    "200": {"description": "Healthy"}
                }
            }
        },
        "/api/health/db": {
            "get": {
                "tags": ["Health Check"],
                "summary": "Check database connectivity status",
                "responses": {
                    "200": {"description": "Database online"},
                    "503": {"description": "Database offline"}
                }
            }
        },
        "/health/db": {
            "get": {
                "tags": ["Health Check"],
                "summary": "Direct check database connectivity status",
                "responses": {
                    "200": {"description": "Database online"},
                    "503": {"description": "Database offline"}
                }
            }
        },
        "/api/health/mqtt": {
            "get": {
                "tags": ["Health Check"],
                "summary": "Check MQTT broker connection status",
                "responses": {
                    "200": {"description": "MQTT online"},
                    "503": {"description": "MQTT offline"}
                }
            }
        },
        "/health/mqtt": {
            "get": {
                "tags": ["Health Check"],
                "summary": "Direct check MQTT broker connection status",
                "responses": {
                    "200": {"description": "MQTT online"},
                    "503": {"description": "MQTT offline"}
                }
            }
        },
        "/api/health/redis": {
            "get": {
                "tags": ["Health Check"],
                "summary": "Check Redis connection status",
                "responses": {
                    "200": {"description": "Redis responsive"},
                    "503": {"description": "Redis connection error"}
                }
            }
        },
        "/health/redis": {
            "get": {
                "tags": ["Health Check"],
                "summary": "Direct check Redis connection status",
                "responses": {
                    "200": {"description": "Redis responsive"},
                    "503": {"description": "Redis connection error"}
                }
            }
        }
    }
}
