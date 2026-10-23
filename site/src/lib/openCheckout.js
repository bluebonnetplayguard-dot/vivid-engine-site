import { api } from '@/api/client';
// Open synchronously in the click handler, before any invoice/checkout request.
export default async function openCheckout(preparePayload) {
  const framed = window.self !== window.top;
  const checkoutTab = framed ? window.open('', '_blank') : null;
  if (framed && !checkoutTab) throw new Error('Allow popups to continue to checkout.');
  if (checkoutTab) checkoutTab.opener = null;
  try {
    const payload = await preparePayload();
    const { data } = await api.functions.invoke('createCheckout', payload);
    if (!data.url) throw new Error(data.error || 'Checkout could not be created.');
    if (checkoutTab) checkoutTab.location.replace(data.url);
    else window.location.assign(data.url);
  } catch (error) { checkoutTab?.close(); throw error; }
}