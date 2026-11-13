import { NextResponse } from 'next/server';
import { syncUnifiWebmail } from '@/lib/unifi-webmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await syncUnifiWebmail());
  } catch {
    console.error('TM Unifi Webmail sync could not finish.');
    return NextResponse.json({ error: 'Unable to check TM Unifi Webmail.' }, { status: 503 });
  }
}
