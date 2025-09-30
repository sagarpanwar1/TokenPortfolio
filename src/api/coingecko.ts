const CG_BASE = 'https://api.coingecko.com/api/v3';

function getApiKey(): string | undefined {
	const fromEnv = (import.meta as any).env?.VITE_CG_KEY as string | undefined;
	const fromStorage = typeof localStorage !== 'undefined' ? localStorage.getItem('VITE_CG_KEY') ?? undefined : undefined;
	return fromEnv || fromStorage;
}

async function cgFetch<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
	const key = getApiKey();
	const url = new URL(CG_BASE + path);
	Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
	if (key) {
		url.searchParams.set('x_cg_demo_api_key', key);
	}
	const res = await fetch(url.toString(), { headers: { 'accept': 'application/json' } });
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Coingecko error ${res.status}: ${text}`);
	}
	return res.json() as Promise<T>;
}

export type Market = {
	id: string;
	symbol: string;
	name: string;
	image: string; // thumb url
	current_price: number;
	price_change_percentage_24h: number | null;
	sparkline_in_7d?: { price: number[] };
};

export async function fetchMarkets(page: number, perPage: number): Promise<Market[]> {
	return cgFetch<Market[]>('/coins/markets', {
		vs_currency: 'usd',
		order: 'market_cap_desc',
		page,
		per_page: perPage,
		sparkline: true,
		price_change_percentage: '24h'
	});
}

export async function fetchMarketsByIds(ids: string[]): Promise<Market[]> {
	if (ids.length === 0) return [];
	return cgFetch<Market[]>('/coins/markets', {
		vs_currency: 'usd',
		ids: ids.join(','),
		sparkline: true,
		price_change_percentage: '24h'
	});
}

export type SearchCoin = { id: string; name: string; symbol: string; thumb: string };
export async function searchCoins(query: string): Promise<SearchCoin[]> {
	const res = await cgFetch<{ coins: Array<{ id: string; name: string; symbol: string; thumb: string }> }>('/search', { query });
	return res.coins.map(c => ({ id: c.id, name: c.name, symbol: c.symbol.toUpperCase(), thumb: c.thumb }));
}

export async function fetchTrending(): Promise<SearchCoin[]> {
	const res = await cgFetch<{ coins: Array<{ item: { id: string; name: string; symbol: string; thumb: string } }> }>('/search/trending');
	return res.coins.map(c => ({ id: c.item.id, name: c.item.name, symbol: c.item.symbol.toUpperCase(), thumb: c.item.thumb }));
}

export async function ping(): Promise<{ gecko_says: string }> {
	return cgFetch('/ping');
}