import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Import serverless controllers
import authApp from './api/auth';
import accidentsApp from './api/accidents';
import adminApp from './api/admin';
import devicesApp from './api/devices';
import iotApp from './api/iot';
import inngestApp from './api/inngest';
import profileApp from './api/profile';
import locationsApp from './api/locations';

const app = express();
app.use(express.json());
app.use(cors());

// Mount the exact serverless route targets
app.use(authApp);
app.use(accidentsApp);
app.use(adminApp);
app.use(devicesApp);
app.use(iotApp);
app.use('/api/inngest', inngestApp);
app.use(profileApp);
app.use(locationsApp);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌐 Local backend server running on http://127.0.0.1:${PORT}`);
});
