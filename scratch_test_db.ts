import axios from 'axios';
import express from 'express';
import http from 'http';
import authApp from './api/auth';
import locationsApp from './api/locations';
import prisma from './backend/config/db';

const app = express();
app.use(express.json());
app.use(authApp);
app.use(locationsApp);

const PORT = 4572;
const BASE_URL = `http://localhost:${PORT}`;

async function getRoleToken(mobile: string): Promise<string> {
  const otpRes = await axios.post(`${BASE_URL}/api/auth/otp/send`, { mobile });
  console.log("OTP send response for mobile:", mobile, otpRes.data);
  const otp = otpRes.data.otp;
  const verifyRes = await axios.post(`${BASE_URL}/api/auth/otp/verify`, { mobile, otp });
  console.log("OTP verify response for mobile:", mobile, verifyRes.data);
  return verifyRes.data.token;
}

const server = http.createServer(app);
server.listen(PORT, async () => {
  try {
    const fireToken = await getRoleToken('9100001111');
    console.log("Token obtained:", fireToken);

    const fireAlerts = await axios.get(`${BASE_URL}/api/fire/alerts`, {
      headers: { Authorization: `Bearer ${fireToken}` }
    });
    console.log("Fire Alerts status:", fireAlerts.status);
    console.log("Fire Alerts response data:", JSON.stringify(fireAlerts.data, null, 2));

  } catch (e: any) {
    console.error("HTTP call failed:", e.response ? { status: e.response.status, data: e.response.data } : e.message);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
});
