import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getTransactionForEdit,
  getRelatedPayable,
  deleteTransaction,
  uploadDocument,
  attachDocToTransaction,
  appendTransaction,
  addTransactionTag,
  updateTransactionRaw,
  getAccountNames
} from '$lib/hledger.server.js';

export const load: PageServerLoad = async ({ params, url }) => {
  const ref = url.searchParams.get('ref') ?? '/register';
  const txn = await getTransactionForEdit(params.id);
  if (!txn) redirect(303, ref);
  const [payableLink, accounts] = await Promise.all([
    getRelatedPayable(txn),
    getAccountNames()
  ]);
  return { txn, ref, payableLink, accounts };
};

export const actions: Actions = {
  delete: async ({ params, url }) => {
    const ref = url.searchParams.get('ref') ?? '/register';
    const result = await deleteTransaction(params.id);
    if (!result.success) return fail(422, { error: result.error ?? 'Delete failed' });
    redirect(303, ref);
  },

  attach: async ({ params, request }) => {
    const data = await request.formData();
    const file = data.get('file') as File | null;
    if (!file || file.size === 0) return fail(400, { attachError: 'No file selected' });

    const buffer = Buffer.from(await file.arrayBuffer());
    const month = new Date().toISOString().slice(0, 7);
    const upload = await uploadDocument(month, file.name, buffer, 'attachments');
    if (!upload.success || !upload.relPath) return fail(500, { attachError: upload.error ?? 'Upload failed' });

    const result = await attachDocToTransaction(params.id, upload.relPath);
    if (!result.success) return fail(422, { attachError: result.error ?? 'Failed to link file' });

    return { attached: true };
  },

  editRaw: async ({ params, request }) => {
    const fd = await request.formData();
    const rawText = fd.get('rawText') as string;
    if (!rawText?.trim()) return fail(400, { editError: 'Empty transaction' });
    const result = await updateTransactionRaw(params.id, rawText);
    if (!result.success) return fail(422, { editError: result.error ?? 'Update failed' });
    return { edited: true };
  },

  pay: async ({ params, request }) => {
    const fd = await request.formData();
    const account = fd.get('account') as string;
    const date = fd.get('date') as string;
    const amount = fd.get('amount') as string;
    const description = fd.get('description') as string;
    const payableAccount = fd.get('payableAccount') as string;
    const billTxid = fd.get('billTxid') as string;

    if (!account || !date || !amount || !payableAccount) {
      return fail(400, { payError: 'Missing required fields' });
    }

    const result = await appendTransaction({
      date,
      description,
      comment: billTxid ? `billid: ${billTxid}` : undefined,
      postings: [
        { account: payableAccount, amount },
        { account, amount: '' }
      ]
    });

    if (!result.success) return fail(422, { payError: result.error ?? 'Failed to create payment' });

    // Write payment txid back onto the bill so the link is bidirectional
    if (billTxid && result.txid) {
      await addTransactionTag(billTxid, 'paymentid', result.txid);
    }

    return { paid: true };
  }
};
