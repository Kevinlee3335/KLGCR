import { NextResponse } from 'next/server';
import { securityAccess, WASTE_COOKIE } from '@/lib/waste/server';
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const response = NextResponse.redirect(new URL('/waste-collection', request.url));
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  if (await securityAccess(token)) response.cookies.set(WASTE_COOKIE, token, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 180 });
  else response.cookies.delete(WASTE_COOKIE);
  return response;
}
