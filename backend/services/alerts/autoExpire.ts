import prisma from '../../config/db';
import { RealtimeService } from '../realtime';
import { AccidentRepository } from '../../repositories/accidents';

/**
 * Auto-expires any accidents or alerts created over 24 hours ago
 * that have not been explicitly resolved, cancelled, or closed.
 */
export async function autoExpireStaleAlerts() {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activeAccidentStatuses = [
    'active', 'alert_created', 'alert_broadcasted', 'accepted', 'dispatched',
    'responded', 'start_response', 'en_route', 'near_incident', 'arrived',
    'victim_located', 'assistance_in_progress', 'victim_transported'
  ];

  try {
    // 1. Find all accidents created > 24 hours ago that are still active
    const staleAccidents = await prisma.accident.findMany({
      where: {
        status: { in: activeAccidentStatuses },
        createdAt: { lt: cutoff24h },
      },
      select: { id: true, accidentCode: true, userId: true },
    });

    if (staleAccidents.length > 0) {
      for (const acc of staleAccidents) {
        // Mark accident as expired
        await AccidentRepository.update(acc.id, {
          status: 'expired',
          resolvedAt: new Date(),
        });

        // Add status log
        await AccidentRepository.createStatusLog({
          accidentId: acc.id,
          status: 'expired',
          notes: 'Emergency alert auto-expired after 24 hours of inactivity.',
        });

        // Mark associated alerts as expired
        await prisma.alert.updateMany({
          where: {
            accidentId: acc.id,
            status: { notIn: ['cancelled', 'rejected', 'resolved', 'expired'] },
          },
          data: { status: 'expired' },
        });

        // Broadcast real-time removal via EMQX MQTT
        await RealtimeService.trigger('accidents', 'status_change', {
          accidentId: acc.id,
          code: acc.accidentCode,
          status: 'expired',
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
      console.log(`[AutoExpire] Successfully expired ${staleAccidents.length} accident(s) older than 24 hours.`);
    }

    // 2. Also expire any standalone alerts created > 24 hours ago
    const staleAlerts = await prisma.alert.updateMany({
      where: {
        createdAt: { lt: cutoff24h },
        status: { notIn: ['cancelled', 'rejected', 'resolved', 'expired'] },
      },
      data: { status: 'expired' },
    });

    if (staleAlerts.count > 0) {
      console.log(`[AutoExpire] Expired ${staleAlerts.count} orphan alert(s) older than 24 hours.`);
    }
  } catch (err: any) {
    console.error('[AutoExpire] Failed to expire 24h stale alerts:', err.message);
  }
}
