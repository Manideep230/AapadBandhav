import fs from 'fs';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AapadBandhav Smart Emergency Response API',
      version: '2.0.0',
      description: `
## AapadBandhav Platform API

**AapadBandhav** is a Smart Emergency Response and Accident Detection Platform for India.

### Features
- 🚨 Real-time accident detection via IoT crash sensors
- 🚑 Smart dispatch to hospitals, ambulances, police, fire departments
- 🗺️ Live GPS tracking of responders and affected users
- 📲 OTP-based authentication for all entity types
- 🛡️ Full RBAC with 11 roles

### Authentication
All protected endpoints require a **Bearer JWT token**.

To authenticate:
1. Send OTP → \`POST /api/auth/otp/send\`
2. Verify OTP → \`POST /api/auth/otp/verify\` → get **token**
3. Click **Authorize** above → enter: \`Bearer <your-token>\`

For admin access use \`POST /api/auth/admin/login\`.

### Roles
\`user\` · \`volunteer\` · \`fire_department\` · \`emergency_personnel\`  
\`hospital\` · \`ambulance\` · \`police_station\` · \`policeman\`  
\`mechanic\` · \`insurance\` · \`admin\` · \`superadmin\`
      `.trim(),
      contact: {
        name: 'AapadBandhav Team',
        email: 'admin@aapadbandhav.in',
      },
      license: {
        name: 'Private',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Current Server (auto — local or production)',
      },
      {
        url: 'http://localhost:5000',
        description: 'Local Development Server',
      },
      {
        url: 'https://aapad-bandhav.vercel.app',
        description: 'Production Server (Vercel)',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token. Get one from POST /api/auth/otp/verify or POST /api/auth/admin/login',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'An error occurred' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            errors: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        TokenResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            entityType: { type: 'string', example: 'user' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cuid_abc123' },
            uniqueId: { type: 'string', example: 'AB123456' },
            fullName: { type: 'string', example: 'Ramesh Kumar' },
            mobile: { type: 'string', example: '9391888104' },
            email: { type: 'string', nullable: true, example: 'ramesh@gmail.com' },
            role: { type: 'string', example: 'user', enum: ['user', 'volunteer', 'fire_department', 'emergency_personnel', 'admin', 'superadmin'] },
            bloodGroup: { type: 'string', example: 'O+' },
            age: { type: 'integer', nullable: true, example: 28 },
            gender: { type: 'string', example: 'Male' },
            address: { type: 'string', nullable: true, example: 'Vijayawada, Andhra Pradesh' },
            isActive: { type: 'boolean', example: true },
            mobileVerified: { type: 'boolean', example: true },
            lastLogin: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Hospital: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Apollo Hospital Vijayawada' },
            mobile: { type: 'string', example: '9100001111' },
            email: { type: 'string', nullable: true },
            address: { type: 'string' },
            latitude: { type: 'number', example: 16.5062 },
            longitude: { type: 'number', example: 80.648 },
            totalBeds: { type: 'integer', example: 200 },
            availableBeds: { type: 'integer', example: 45 },
            isActive: { type: 'boolean' },
          },
        },
        Volunteer: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fullName: { type: 'string', example: 'Suresh Babu' },
            mobile: { type: 'string' },
            role: { type: 'string', example: 'volunteer' },
            skills: { type: 'array', items: { type: 'string' }, example: ['first_aid', 'driving'] },
            isActive: { type: 'boolean' },
          },
        },
        Police: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            stationName: { type: 'string', example: 'Vijayawada Central Police Station' },
            mobile: { type: 'string' },
            address: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            isActive: { type: 'boolean' },
          },
        },
        FireDepartment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fullName: { type: 'string', example: 'Ravi Shankar' },
            mobile: { type: 'string' },
            role: { type: 'string', example: 'fire_department' },
            isActive: { type: 'boolean' },
          },
        },
        Vehicle: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vehicleNumber: { type: 'string', example: 'AP16TX9999' },
            vehicleType: { type: 'string', example: 'Car', enum: ['Car', 'Bike', 'Truck', 'Bus', 'Auto'] },
            ownerId: { type: 'string' },
            deviceId: { type: 'string', nullable: true },
          },
        },
        Accident: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            accidentCode: { type: 'string', example: 'ACC-123456' },
            userId: { type: 'string' },
            vehicleNumber: { type: 'string' },
            vehicleType: { type: 'string' },
            latitude: { type: 'number', example: 16.5062 },
            longitude: { type: 'number', example: 80.648 },
            severity: { type: 'string', example: 'high', enum: ['low', 'medium', 'high', 'critical'] },
            status: { type: 'string', example: 'active', enum: ['active', 'dispatched', 'responded', 'resolved', 'cancelled', 'false_alarm'] },
            description: { type: 'string' },
            speedAtImpact: { type: 'number' },
            impactValue: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        EmergencyContact: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            name: { type: 'string', example: 'Father' },
            mobile: { type: 'string', example: '9876543210' },
            relation: { type: 'string', example: 'Father' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            entityId: { type: 'string' },
            title: { type: 'string', example: 'Accident Alert' },
            body: { type: 'string', example: 'An accident has been detected near your location.' },
            type: { type: 'string', example: 'accident_alert' },
            data: { type: 'object' },
            read: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        SOSRequest: {
          type: 'object',
          properties: {
            accidentId: { type: 'string' },
            accidentCode: { type: 'string', example: 'ACC-123456' },
            latitude: { type: 'number', example: 16.5062 },
            longitude: { type: 'number', example: 80.648 },
            severity: { type: 'string', example: 'high' },
          },
        },
        TrackingLocation: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cuid_abc123' },
            name: { type: 'string', example: 'Apollo Hospital' },
            role: { type: 'string', example: 'ambulance' },
            latitude: { type: 'number', example: 16.5062 },
            longitude: { type: 'number', example: 80.6480 },
            mobile: { type: 'string', example: '9876543210' },
            isAvailable: { type: 'boolean', example: true },
            rating: { type: 'number', example: 4.8 },
            vehicleNumber: { type: 'string', nullable: true, example: 'AP16TX9999' },
            organization: { type: 'string', nullable: true, example: 'GVK EMRI' },
            specialization: { type: 'string', nullable: true, example: 'General Engine' },
            stationCode: { type: 'string', nullable: true, example: 'PS-VJA' },
            badgeNumber: { type: 'string', nullable: true, example: 'COP882' },
            rank: { type: 'string', nullable: true, example: 'Inspector' },
            department: { type: 'string', nullable: true, example: 'Traffic Branch' },
            bedCapacity: { type: 'integer', nullable: true, example: 50 },
            availableBeds: { type: 'integer', nullable: true, example: 12 },
          },
        },
        Device: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            deviceId: { type: 'string', example: '4810881048888104' },
            passName: { type: 'string', example: 'DEV88FF2C' },
            passCode: { type: 'string', example: 'PASS8A7B9' },
            simCode: { type: 'string', example: '881234567890' },
            status: { type: 'string', example: 'active', enum: ['active', 'inactive', 'maintenance'] },
            isLinked: { type: 'boolean', example: true },
            isActive: { type: 'boolean', example: true },
            batteryLevel: { type: 'number', example: 85.5 },
            firmwareVersion: { type: 'string', example: '1.0.0' },
          },
        },
        RouteNavigation: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            accidentId: { type: 'string' },
            responderId: { type: 'string' },
            responderType: { type: 'string' },
            originLat: { type: 'number' },
            originLng: { type: 'number' },
            destLat: { type: 'number' },
            destLng: { type: 'number' },
            status: { type: 'string', enum: ['active', 'completed', 'cancelled'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            accidentId: { type: 'string' },
            recipientId: { type: 'string' },
            recipientType: { type: 'string', example: 'hospital' },
            status: { type: 'string', example: 'pending', enum: ['pending', 'acknowledged', 'responded', 'rejected'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AnalyticsResponse: {
          type: 'object',
          properties: {
            totalAccidents: { type: 'integer', example: 124 },
            resolvedAccidents: { type: 'integer', example: 98 },
            avgResponseTime: { type: 'number', description: 'Average response time in minutes', example: 8.5 },
            slaBreached: { type: 'integer', example: 12 },
            severityBreakdown: {
              type: 'object',
              properties: {
                low: { type: 'integer' },
                medium: { type: 'integer' },
                high: { type: 'integer' },
                critical: { type: 'integer' },
              },
            },
          },
        },
      },
    },
    security: [],
    tags: [
      { name: 'Authentication', description: 'OTP-based login, registration and session management' },
      { name: 'Profile', description: 'User and service entity profile management' },
      { name: 'Emergency Contacts', description: 'Personal emergency contact management for users' },
      { name: 'Accidents', description: 'Accident detection, reporting, dispatch and resolution' },
      { name: 'Alerts', description: 'Emergency alerts dispatched to responders' },
      { name: 'Devices', description: 'IoT device linking, sharing and telemetry' },
      { name: 'IoT', description: 'Direct IoT hardware telemetry ingestion endpoints' },
      { name: 'Tracking', description: 'Live GPS location updates and active responder discovery' },
      { name: 'Navigation', description: 'Route assignment and live navigation for responders' },
      { name: 'Notifications', description: 'In-app notification delivery and FCM token registration' },
      { name: 'Insurance', description: 'Insurance company customer management and alert feed' },
      { name: 'Admin – Devices', description: 'Device inventory, bulk generation and management (admin only)' },
      { name: 'Admin – Users', description: 'User and admin account management (admin only)' },
      { name: 'Admin – Dashboard', description: 'Platform metrics, analytics and KPI dashboard (admin only)' },
      { name: 'Admin – Services', description: 'Service provider (hospital, ambulance, police) registration (admin only)' },
      { name: 'Admin – Logs', description: 'Audit logs and socket diagnostics (admin only)' },
      { name: 'Health', description: 'System health and service connectivity checks' },
    ],
  },
  apis: [
    path.join(__dirname, '../auth/index.ts'),
    path.join(__dirname, '../users/index.ts'),
    path.join(__dirname, '../accidents/index.ts'),
    path.join(__dirname, '../alerts/index.ts'),
    path.join(__dirname, '../devices/index.ts'),
    path.join(__dirname, '../devices/iot.ts'),
    path.join(__dirname, '../tracking/index.ts'),
    path.join(__dirname, '../navigation/index.ts'),
    path.join(__dirname, '../notifications/index.ts'),
    path.join(__dirname, '../vehicles/index.ts'),
    path.join(__dirname, '../admin/index.ts'),
    path.join(__dirname, '../../../../api/locations.ts'),
  ],
};

const openApiSpec = swaggerJsdoc(options);
const outputPath = path.join(__dirname, 'openapi.json');

fs.writeFileSync(outputPath, JSON.stringify(openApiSpec, null, 2));
console.log('✅ Swagger OpenAPI spec generated successfully at:', outputPath);
