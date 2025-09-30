import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from 'recharts';
import { fetchMarkets, Market, fetchTrending, searchCoins, fetchMarketsByIds } from './api/coingecko';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from './store';
import { addItems, updateHoldings } from './store';

// Market view joined with watchlist
type Row = {
	id: string; name: string; symbol: string; icon: string;
	price: number; change24h: number; spark7d: number[]; holdings: number;
};

type PortfolioSlice = { name: string; value: number; color: string };

const COLORS = ['#7C8CF8', '#64E1B1', '#F7B267', '#59C3FF', '#7CE7FD', '#F47171'];

function formatCurrency(v: number) {
	return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export default function App() {
	const dispatch = useDispatch();
	const watchlist = useSelector((s: RootState) => s.watchlist.items);
	const [marketRows, setMarketRows] = useState<Row[]>([]);
	const [page, setPage] = useState(1);
	const pageSize = 10;
	const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draftHoldings, setDraftHoldings] = useState<string>('');

	// Seed default tokens on first run so the dashboard isn't empty
	useEffect(() => {
		async function seed() {
			try {
				const markets = await fetchMarkets(1, 6);
				dispatch(addItems(markets.map((m, i) => ({
					id: m.id,
					name: m.name,
					symbol: m.symbol.toUpperCase(),
					icon: m.image,
					holdings: [0.05, 2.5, 2.5, 0.05, 2.5, 15000][i] ?? 0
				}))));
			} catch { }
		}
		if (watchlist.length === 0) seed();
		// run only when list is empty
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [watchlist.length]);

	// Add Token Modal state
	const [isModalOpen, setModalOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<{ id: string; name: string; symbol: string; thumb: string }[]>([]);
	const [hasMore, setHasMore] = useState(true);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const listRef = useRef<HTMLDivElement>(null);

	function joinMarkets(markets: Market[]): Row[] {
		const byId = new Map(markets.map(m => [m.id, m] as const));
		return watchlist.map(w => {
			const m = byId.get(w.id);
			return {
				id: w.id,
				name: w.name,
				symbol: w.symbol,
				icon: w.icon,
				price: m?.current_price ?? 0,
				change24h: m?.price_change_percentage_24h ?? 0,
				spark7d: m?.sparkline_in_7d?.price ?? [],
				holdings: w.holdings
			};
		});
	}

	async function load() {
		try {
			setLoading(true);
			setError(null);
			const ids = watchlist.map(w => w.id);
			const markets = ids.length ? await fetchMarketsByIds(ids) : [];
			setMarketRows(joinMarkets(markets));
			setLastUpdated(new Date());
		} catch (e: any) {
			setError(e?.message ?? 'Failed to fetch data');
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => { load(); }, [watchlist]);

	const portfolioSlices: PortfolioSlice[] = useMemo(() => {
		const top = marketRows.slice(0, 6);
		return top.map((r, i) => ({ name: `${r.name} (${r.symbol})`, value: r.price * r.holdings, color: COLORS[i % COLORS.length] }));
	}, [marketRows]);

	const totalValue = portfolioSlices.reduce((s, x) => s + x.value, 0);

	function onRefresh() { load(); }

	function startEdit(row: Row) { setEditingId(row.id); setDraftHoldings(String(row.holdings)); }
	function saveEdit(id: string) {
		const value = Number(draftHoldings);
		if (!Number.isFinite(value)) return;
		dispatch(updateHoldings({ id, holdings: value }));
		setEditingId(null);
	}

	// Modal logic
	useEffect(() => {
		if (!isModalOpen) return;
		let cancelled = false;
		(async () => {
			setSelected(new Set());
			const trending = await fetchTrending();
			if (!cancelled) setResults(trending);
		})();
		return () => { cancelled = true; };
	}, [isModalOpen]);

	useEffect(() => {
		if (!isModalOpen) return;
		const t = setTimeout(async () => {
			if (!query.trim()) return;
			const found = await searchCoins(query.trim());
			setResults(found);
		}, 250);
		return () => clearTimeout(t);
	}, [query, isModalOpen]);

	function onScrollList() {/* search endpoint has no paging; noop */ }
	function toggleSelect(id: string) {
		setSelected(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id); else next.add(id);
			return next;
		});
	}
	async function addToWatchlist() {
		const ids = Array.from(selected);
		const markets = await fetchMarketsByIds(ids);
		dispatch(addItems(markets.map(m => ({ id: m.id, name: m.name, symbol: m.symbol.toUpperCase(), icon: m.image, holdings: 0 }))));
		setModalOpen(false);
	}

	// Pagination
	const totalPages = Math.max(1, Math.ceil(marketRows.length / pageSize));
	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [totalPages]);
	const paged = useMemo(() => {
		const start = (page - 1) * pageSize;
		return marketRows.slice(start, start + pageSize);
	}, [marketRows, page]);

	useEffect(() => {
    setPage(1);
}, [marketRows.length]);

	return (
		<div className="container">
			<div className="header">
				<div className="row">
					<div className="badge">Token Portfolio</div>
					<div className="title">Dashboard</div>
				</div>
				<div className="right">
					<button className="button primary">Connect Wallet</button>
				</div>
			</div>

			<div className="card grid">
				<div>
					<div>Portfolio Total</div>
					<div className="h1">{formatCurrency(totalValue)}</div>
					<div className="subtle">Last updated: {dayjs(lastUpdated).format('h:mm:ss A')}</div>
					{error && <div className="subtle" style={{ color: '#ff6b6b', marginTop: 8 }}>{error}</div>}
				</div>
				<div className="chartWrap">
					<div style={{ width: 220, height: 220 }}>
						<ResponsiveContainer>
							<PieChart>
								<Pie data={portfolioSlices} dataKey="value" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="#0f1115">
									{portfolioSlices.map((entry, index) => (
										<Cell key={index} fill={entry.color} />
									))}
								</Pie>
							</PieChart>
						</ResponsiveContainer>
					</div>
					<div className="legend">
						{portfolioSlices.map((p, i) => (
							<>
								<span className="dot" style={{ background: p.color }} />
								<span>{p.name}</span>
								<span>{((p.value / totalValue) * 100 || 0).toFixed(1)}%</span>
							</>
						))}
					</div>
				</div>
			</div>

			<div className="row" style={{ marginTop: 28, marginBottom: 12 }}>
				<div className="row" style={{ gap: 8 }}>
					<span style={{ color: '#b4f461' }}>★</span>
					<div className="title">Watchlist</div>
				</div>
				<div className="right">
					<button className="button" onClick={() => load()} disabled={loading}>{loading ? 'Refreshing…' : '⟳ Refresh Prices'}</button>
					<button className="button primary" onClick={() => setModalOpen(true)}>+ Add Token</button>
				</div>
			</div>

			<div className="card tableWrap">
				<table className="table">
					<thead>
						<tr>
							<th>Token</th>
							<th>Price</th>
							<th>24h %</th>
							<th className="hide-sm">Sparkline (7d)</th>
							<th>Holdings</th>
							<th>Value</th>
							<th className="hide-sm"></th>
						</tr>
					</thead>
					<tbody>
						{paged.map((r, idx) => {
							const value = r.holdings * r.price;
							const isEditing = editingId === r.id;
							return (
								<tr key={r.id} className={`tr ${idx % 2 === 2 ? 'highlight' : ''}`}>
									<td>
										<div className="token">
											<img src={r.icon} alt="" />
											<div>
												<div>{r.name}</div>
												<div className="subtle">{r.symbol}</div>
											</div>
										</div>
									</td>
									<td>{formatCurrency(r.price)}</td>
									<td className={`percent ${r.change24h >= 0 ? 'pos' : 'neg'}`}>{r.change24h.toFixed(2)}%</td>
									<td className="hide-sm">
										<ResponsiveContainer width={120} height={40}>
											<LineChart data={r.spark7d.map((v, i) => ({ i, v }))} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
												<YAxis hide domain={[0, 'auto']} />
												<Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : String(v))} labelFormatter={() => ''} contentStyle={{ background: '#0f1115', border: '1px solid #232737' }} />
												<Line type="monotone" dataKey="v" stroke={r.change24h >= 0 ? '#49d49d' : '#ff6b6b'} strokeWidth={2} dot={false} />
											</LineChart>
										</ResponsiveContainer>
									</td>
									<td className="holdingsCell">
										{isEditing ? (
											<div className="holdingsEditor">
												<select className="holdingsInput" value={draftHoldings} onChange={e => setDraftHoldings(e.target.value)}>
													<option value={String(r.holdings)}>{r.holdings.toFixed(4)}</option>
													<option value="0.0500">0.0500</option>
													<option value="0.5000">0.5000</option>
													<option value="2.5000">2.5000</option>
													<option value="15.0000">15.0000</option>
												</select>
												<button className="saveBtn" onClick={() => saveEdit(r.id)}>Save</button>
											</div>
										) : (
											<div className="holdingsEditor">
												<span>{r.holdings.toFixed(4)}</span>
												<button className="button" onClick={() => startEdit(r)}>Edit</button>
											</div>
										)}
									</td>
									<td>{formatCurrency(value)}</td>
									<td className="hide-sm">⋯</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				<div className="footer">
    {marketRows.length ? (
        <div>
            {`${(page - 1) * pageSize + 1} — ${Math.min(page * pageSize, marketRows.length)} of ${marketRows.length} results`}
        </div>
    ) : (
        'No results'
    )}
    <div className="pagination">
        <span>{page} of {totalPages} pages</span>
        <span
            className={`link${page === 1 ? ' disabled' : ''}`}
            onClick={() => page > 1 && setPage(page - 1)}
            style={{ pointerEvents: page === 1 ? 'none' : 'auto', opacity: page === 1 ? 0.5 : 1 }}
        >
            Prev
        </span>
        <span
            className={`link${page === totalPages ? ' disabled' : ''}`}
            onClick={() => page < totalPages && setPage(page + 1)}
            style={{ pointerEvents: page === totalPages ? 'none' : 'auto', opacity: page === totalPages ? 0.5 : 1 }}
        >
            Next
        </span>
    </div>
</div>
			</div>

			{isModalOpen && (
				<div className="overlay" onClick={() => setModalOpen(false)}>
					<div className="modal" onClick={e => e.stopPropagation()}>
						<div className="modalHeader">
							<input className="searchInput" placeholder="Search tokens (e.g., ETH, SOL)..." value={query} onChange={e => setQuery(e.target.value)} />
						</div>
						<div className="modalBody" onScroll={onScrollList} ref={listRef}>
							<div className="sectionTitle">Trending</div>
							{results.map((c) => {
								const isSel = selected.has(c.id);
								return (
									<div key={c.id} className="tokenRow" onClick={() => toggleSelect(c.id)}>
										<img src={c.thumb} alt="" width={20} height={20} style={{ borderRadius: 6 }} />
										<div className="meta">
											<strong>{c.name}</strong>
											<span className="subtle">{c.symbol}</span>
										</div>
										<div className="selIcons">
											<span className={`icon check${isSel ? '' : ''}`}>{isSel ? '✓' : ''}</span>
											<span className={`icon star${isSel ? ' star' : ''}`}>{isSel ? '★' : ''}</span>
										</div>
									</div>
								);
							})}
						</div>
						<div className="modalFooter">
							<button className="action" onClick={() => setModalOpen(false)}>Cancel</button>
							<button className="action primary" disabled={selected.size === 0} onClick={addToWatchlist}>Add to Watchlist</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
