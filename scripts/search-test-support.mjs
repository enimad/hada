import { randomUUID } from "node:crypto";

// Database double for route integration tests. Never writes to Supabase.
export function createMemorySupabase(profile) {
  const tables = { wedding_profiles: [profile], conversations: [], messages: [], vendor_requests: [], vendor_candidates: [] };
  return {
    tables,
    from(table) {
      if (!tables[table]) throw new Error(`Unexpected table: ${table}`);
      let filters = [], action = "select", payload, maximum = Infinity, sorting;
      const run = () => {
        let rows = tables[table].filter(row => filters.every(test => test(row)));
        if (action === "insert") {
          rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: randomUUID(), created_at: new Date().toISOString(), ...row }));
          tables[table].push(...rows);
        }
        if (action === "update") rows.forEach(row => Object.assign(row, payload));
        if (sorting) rows = [...rows].sort((a, b) => String(a[sorting.key]).localeCompare(String(b[sorting.key])) * (sorting.ascending ? 1 : -1));
        return { data: rows.slice(0, maximum), error: null };
      };
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        order(key, { ascending = true } = {}) { sorting = { key, ascending }; return query; },
        limit(value) { maximum = value; return query; },
        insert(value) { action = "insert"; payload = value; return query; },
        update(value) { action = "update"; payload = value; return query; },
        async maybeSingle() { const result = run(); return { ...result, data: result.data[0] ?? null }; },
        async single() { const result = await query.maybeSingle(); if (!result.data) throw new Error("Expected one row"); return result; },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); }
      };
      return query;
    }
  };
}
