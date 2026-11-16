import { list, put } from '@vercel/blob';

const encoded = (value: string): string => encodeURIComponent(value).slice(0, 200);

export async function acceptedBy(proofTx: string): Promise<string | undefined> {
  const { blobs } = await list({ prefix: `seen/${proofTx.toLowerCase()}/`, limit: 1 });
  const path = blobs[0]?.pathname;
  return path ? decodeURIComponent(path.split('/')[2] ?? '') : undefined;
}

export async function markAccepted(proofTx: string, taskId: string): Promise<void> {
  await put(`seen/${proofTx.toLowerCase()}/${encoded(taskId)}`, taskId, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}
