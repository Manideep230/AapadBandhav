import React, { useState, useMemo } from 'react';
import {
  SearchIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from './Icons';

export default function ResponsiveTable({ columns, data, initialSortKey = '', placeholder = 'No records found' }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    return columns.reduce((acc, col) => ({ ...acc, [col.key]: true }), {});
  });
  const [showVisibilityDropdown, setShowVisibilityDropdown] = useState(false);

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

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const sorted = [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDirection === 'asc'
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });
    return sorted;
  }, [filteredData, sortKey, sortDirection]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const activeColumns = columns.filter(col => visibleColumns[col.key]);

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

  const renderValue = (row, col) => {
    return col.render ? col.render(row) : (row[col.key] ?? '-');
  };

  return (
    <div className="responsive-table-container">
      <div className="table-controls-bar" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '420px' }}>
          <SearchIcon size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search records..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ paddingLeft: '38px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowVisibilityDropdown(!showVisibilityDropdown)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <EyeIcon size={14} /> Columns
          </button>

          {showVisibilityDropdown && (
            <div className="card" style={{
              position: 'absolute',
              top: '48px',
              right: 0,
              zIndex: 100,
              minWidth: '200px',
              padding: '14px',
              marginBottom: 0
            }}>
              <h5 style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>Visible Columns</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {columns.map(col => (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!visibleColumns[col.key]}
                      onChange={() => toggleColumn(col.key)}
                      style={{ accentColor: 'var(--red-primary)' }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <select
            className="form-select"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            style={{ width: '116px', padding: '0 12px', fontSize: 13 }}
          >
            {[5, 10, 25, 50].map(size => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap mobile-card-table">
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
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {col.label}
                    {col.sortable !== false && sortKey === col.key && (
                      sortDirection === 'asc' ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, rIndex) => (
              <tr key={row.id || rIndex}>
                {columns.map(col => visibleColumns[col.key] && (
                  <td key={col.key}>
                    {renderValue(row, col)}
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

      <div className="mobile-card-list">
        {paginatedData.map((row, rIndex) => (
          <article className="mobile-record-card" key={row.id || rIndex}>
            {activeColumns.map(col => (
              <div className="mobile-record-card-row" key={col.key}>
                <div className="mobile-record-card-label">{col.label}</div>
                <div className="mobile-record-card-value">{renderValue(row, col)}</div>
              </div>
            ))}
          </article>
        ))}
        {paginatedData.length === 0 && (
          <div className="mobile-record-card" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
            {placeholder}
          </div>
        )}
      </div>

      <div className="table-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Showing {sortedData.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, sortedData.length)} of {sortedData.length} records
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm icon-btn"
            onClick={() => setPage(p => Math.max(p - 1, 1))}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <ChevronLeftIcon size={16} />
          </button>
          <span style={{ fontSize: 13, padding: '0 8px', color: 'var(--text-primary)', fontWeight: 600 }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm icon-btn"
            onClick={() => setPage(p => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
