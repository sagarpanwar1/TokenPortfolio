import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

export type WatchlistItem = {
	id: string;
	name: string;
	symbol: string;
	icon: string;
	holdings: number;
};

export type WatchlistState = {
	items: WatchlistItem[];
};

const STORAGE_KEY = 'tp_watchlist_v1';

function loadState(): WatchlistState | undefined {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return undefined;
		return JSON.parse(raw) as WatchlistState;
	} catch { return undefined; }
}

const initialState: WatchlistState = loadState() ?? { items: [] };

const watchlistSlice = createSlice({
	name: 'watchlist',
	initialState,
	reducers: {
		addItems(state, action: PayloadAction<WatchlistItem[]>) {
			const existing = new Set(state.items.map(i => i.id));
			for (const it of action.payload) {
				if (!existing.has(it.id)) state.items.unshift(it);
			}
		},
		updateHoldings(state, action: PayloadAction<{ id: string; holdings: number }>) {
			const it = state.items.find(i => i.id === action.payload.id);
			if (it) it.holdings = action.payload.holdings;
		},
		removeItem(state, action: PayloadAction<string>) {
			state.items = state.items.filter(i => i.id !== action.payload);
		}
	}
});

export const { addItems, updateHoldings, removeItem } = watchlistSlice.actions;

export const store = configureStore({
	reducer: { watchlist: watchlistSlice.reducer }
});

store.subscribe(() => {
	try {
		const state = store.getState() as { watchlist: WatchlistState };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state.watchlist));
	} catch {}
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

