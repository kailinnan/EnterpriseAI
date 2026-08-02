import 'dotenv/config';
import { Worker } from 'bullmq';
import { processDocument } from './processor.js';
import { closeDb } from '@hub/db';
import { logger } from '@hub/logger';
const worker = new Worker(
  'documents',
  async (job) => {
    if (job.name !== 'document.parse') throw new Error('UNKNOWN_JOB');
    await processDocument(
      job.data as { tenantId: string; knowledgeBaseId: string; documentId: string },
    );
  },
  { connection: { url: String(process.env.REDIS_URL) }, concurrency: 2 },
);
worker.on('failed', (job, error) =>
  logger.error(
    {
      requestId: job?.id,
      traceId: job?.data?.documentId,
      tenantId: job?.data?.tenantId,
      error: error.message,
    },
    'document.job.failed',
  ),
);
const shutdown = async () => {
  await worker.close();
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
