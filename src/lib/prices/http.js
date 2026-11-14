import { Capacitor, CapacitorHttp } from '@capacitor/core';

// GET a JSON document. In the Android app requests go through the native HTTP
// client, which isn't subject to WebView CORS (mfapi.in's NAV endpoints send
// no CORS headers); in the browser this is a normal fetch.
export async function getJson(url, headers = {}) {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, headers, responseType: 'json' });
    if (res.status < 200 || res.status >= 300) throw new Error(`Request failed (${res.status})`);
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}
