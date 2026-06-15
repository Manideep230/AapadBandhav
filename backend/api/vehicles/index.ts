import express from 'express';
import cors from 'cors';
import prisma from '../../config/db';
import { UserRepository } from '../../repositories/users';
import { AlertRepository } from '../../repositories/alerts';
import { withAuth, AuthenticatedRequest } from '../../middleware/auth';

const router = express.Router();

router.get('/api/insurance/customers', withAuth(async (req: AuthenticatedRequest, res) => {
  const insuranceId = req.entityId || '';
  try {
    const customers = await prisma.insuranceCustomer.findMany({
      where: { insuranceId, isActive: true },
      include: { user: true },
    });

    return res.status(200).json({
      success: true,
      customers: customers.map((c: any) => ({
        id: c.id,
        user_id: c.userId,
        policy_number: c.policyNumber,
        is_active: c.isActive,
        user: {
          fullName: c.user.fullName,
          mobile: c.user.mobile,
          uniqueId: c.user.uniqueId,
        },
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['insurance']));

router.post('/api/insurance/link-customer', withAuth(async (req: AuthenticatedRequest, res) => {
  const insuranceId = req.entityId || '';
  const { customerUniqueId, policyNumber, customer_id, policy_number } = req.body || {};
  const uniqId = customerUniqueId || customer_id;
  const policyNum = policyNumber || policy_number;

  if (!uniqId) return res.status(400).json({ success: false, message: 'customerUniqueId is required' });

  try {
    const user = await UserRepository.findUserByMobile(uniqId); // Or find uniqueId
    let dbUser = user;
    if (!dbUser) {
      dbUser = await prisma.user.findUnique({ where: { uniqueId: uniqId } });
    }

    if (!dbUser || dbUser.role !== 'user') {
      return res.status(404).json({ success: false, message: 'Citizen user with this unique ID not found' });
    }

    const existing = await prisma.insuranceCustomer.findFirst({
      where: { userId: dbUser.id, insuranceId, isActive: true },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: 'This customer is already linked to your company' });
    }

    const link = await prisma.insuranceCustomer.create({
      data: {
        userId: dbUser.id,
        insuranceId,
        policyNumber: policyNum || null,
        isActive: true,
      },
    });

    return res.status(201).json({ success: true, message: `Linked customer ${dbUser.fullName}`, customer: link });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['insurance']));

router.delete('/api/insurance/customers/:user_id', withAuth(async (req: AuthenticatedRequest, res) => {
  const insuranceId = req.entityId || '';
  const userId = req.params.user_id;

  try {
    const customer = await prisma.insuranceCustomer.findFirst({
      where: { userId, insuranceId, isActive: true },
    });

    if (!customer) return res.status(404).json({ success: false, message: 'Customer link not found' });

    await prisma.insuranceCustomer.delete({ where: { id: customer.id } });

    return res.status(200).json({ success: true, message: 'Customer unlinked successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['insurance']));

router.get('/api/insurance/alerts', withAuth(async (req: AuthenticatedRequest, res) => {
  const insuranceId = req.entityId || '';
  try {
    const alerts = await AlertRepository.findByRecipient(insuranceId, 'insurance');
    return res.status(200).json({ success: true, alerts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}, ['insurance']));

const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

export default app;
