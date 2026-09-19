import { NextRequest, NextResponse } from 'next/server';
import { getMarketService } from '@/services/market';
import type { ApiResponse, SearchResult } from '@/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<SearchResult[]>>> {
  try {
    const q = request.nextUrl.searchParams.get('q');
    if (!q || q.trim().length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const service = getMarketService();
    const results = await service.searchTokens(q.trim());

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    );
  }
}
