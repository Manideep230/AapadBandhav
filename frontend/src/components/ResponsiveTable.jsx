import React, { useState, useMemo } from 'react';

export default function ResponsiveTable({ columns, data, initialSortKey = '', placeholder = 'No records found' }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    return columns.reduce((acc, col) => ({ ...acc, [col.key]: true }), {});
  });
  const [showVisibilityDropdown, setShowVisibilityDropdown] = useState(false);

  // 1. Search Filter
  const filteredData = useMemo(() => {
    if (!search) return data;
    const lowerSearch = search.toLowerCase();
    return data.filter(row => {
      return Object.keys(row).some(key => {
        const val = row[key];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(lowerSearch);
      });
    });
  }, [data, search]);

  // 2. Sorting
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const sorted = [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      // Handle numbers
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      
      // Handle strings/others
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDirection === 'asc' 
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });
    return sorted;
  }, [filteredData, sortKey, sortDirection]);

  // 3. Pagination
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;

  const handleSort = (key, sortable = true) => {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="responsive-table-container">
      {/* Controls panel */}
      <div className="table-controls-bar" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '400px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Search records..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ paddingLeft: '32px', borderRadius: '8px' }}
          />
        </div>

        {/* Buttons and actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', position: 'relative' }}>
          {/* Column Visibility Selector */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowVisibilityDropdown(!showVisibilityDropdown)}
            style={{ borderRadius: '8px', fontSize: 13 }}
          >
            👁️ Columns
          </button>
          
          {showVisibilityDropdown && (
            <div className="card" style={{
              position: 'absolute',
              top: '40px',
              right: 0,
              zIndex: 100,
              minWidth: '180px',
              padding: '12px',
              boxShadow: 'var(--shadow-card)',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)'
            }}>
              <h5 style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>Visible Columns</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {columns.map(col => (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!visibleColumns[col.key]}
                      onChange={() => toggleColumn(col.key)}
                      style={{ accentColor: 'var(--red-500)' }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Page Size */}
          <select
            className="form-select"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ width: '80px', height: '34px', padding: '0 8px', borderRadius: '8px', fontSize: 13 }}
          >
            {[5, 10, 25, 50].map(size => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table view */}
      <div className="table-wrap" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <table>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
              {columns.map(col => visibleColumns[col.key] && (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key, col.sortable !== false)}
                  style={{
                    cursor: col.sortable !== false ? 'pointer' : 'default',
                    userSelect: 'none',
                    position: 'relative',
                    padding: '12px 16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {col.label}
                    {col.sortable !== false && sortKey === col.key && (
                      <span style={{ fontSize: 9 }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, rIndex) => (
              <tr key={row.id || rIndex} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {columns.map(col => visibleColumns[col.key] && (
                  <td key={col.key} style={{ padding: '12px 16px', fontSize: '13px' }}>
                    {col.render ? col.render(row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  {placeholder}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="table-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Showing {sortedData.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, sortedData.length)} of {sortedData.length} records
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPage(p => Math.max(p - 1, 1))}
            disabled={page === 1}
            style={{ borderRadius: '6px', minWidth: '36px', height: '32px', padding: 0 }}
          >
            ◀
          </button>
          <span style={{ fontSize: 13, padding: '0 8px', color: 'var(--text-primary)', fontWeight: 600 }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPage(p => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            style={{ borderRadius: '6px', minWidth: '36px', height: '32px', padding: 0 }}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
