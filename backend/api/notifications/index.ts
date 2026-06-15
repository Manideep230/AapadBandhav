import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';

const router = express.Router();

router.get('/api/notifications', withAuth(async (req: AuthenticatedRequest, res) => {
  const entityId = req.entityId || '';
  try {
    const notifications = await prisma.notification.findMany({
      where: { entityId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.status(200).json({ success: true, notifications });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}));

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
