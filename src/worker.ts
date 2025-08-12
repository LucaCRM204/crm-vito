import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from './prisma';

const connection = new IORedis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export const inactivityQ = new Queue('vito_inactivity', { connection });

export async function enqueueInactivity(leadId: string, seconds: number) {
  await inactivityQ.add(
    'check',
    { leadId },
    {
      delay: seconds * 1000,
      removeOnComplete: true,
      removeOnFail: true
    }
  );
}

new Worker(
  'vito_inactivity',
  async job => {
    const { leadId } = job.data as { leadId: string };
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.estado !== 'NUEVO' || !lead.lastMsgAt) return;

    const waited = Date.now() - new Date(lead.lastMsgAt).getTime();
    const limitMs = Number(process.env.INACTIVITY_SECONDS || 21600) * 1000;

    if (waited >= limitMs) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { estado: 'INCOMPLETO' }
      });
      // Opcional: enviar a Google Sheet de incompletos aquí
    }
  },
  { connection }
);
