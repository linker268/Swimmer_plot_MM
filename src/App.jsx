import React, { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [settings, setSettings] = useState({
    sortBy: 'duration',
    groupByCohort: true,
    showGrid: true,
    barHeight: 20,
    barGap: 22,
  });

  // MM Response criteria colors
  const colors = {
    'MRD-': '#053B26', // MRD negative - 가장 진한 초록 (흰 중심점으로 sCR과 구분)
    sCR: '#0B5D3B',   // Stringent CR - 진한 초록
    CR: '#2E9B6F',    // Complete Response - 초록
    VGPR: '#8FD14F',  // Very Good PR - 연두
    PR: '#7FBADC',    // Partial Response - 파랑
    MR: '#FF9800',    // Minimal Response - 주황
    SD: '#F5C342',    // Stable Disease - 노랑
    PD: '#8B8B8B',    // Progressive Disease - 회색
    ASCT: '#9B59B6',  // ASCT - 보라
    Death: '#E53935', // Death - 빨강
    bar: '#B8C0CC',   // 환자 타임라인 막대 - 중립 회색
  };

  const responseOrder = ['sCR', 'CR', 'VGPR', 'PR', 'MR', 'SD', 'PD'];

  const parseFile = useCallback((file) => {
    setError(null);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        let parsedData;
        
        if (file.name.endsWith('.csv')) {
          const result = Papa.parse(e.target.result, { header: true });
          parsedData = result.data;
        } else {
          const workbook = XLSX.read(e.target.result, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          parsedData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        }
        
        const processedData = processData(parsedData);
        setData(processedData);
      } catch (err) {
        setError('파일을 처리하는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const processData = (rawData) => {
    const MS = 1000 * 60 * 60 * 24 * 30.44;
    return rawData.map((row, index) => {
      const c1d1 = parseDate(row.C1D1);
      if (!c1d1) return null;
      const mo = (v) => { const d = parseDate(v); return d ? (d - c1d1) / MS : null; };

      const responses = [];
      for (let i = 1; i <= 10; i++) {
        const d = row[`Resp_date${i}`], r = row[`Response${i}`];
        if (d && r) {
          const m = mo(d);
          let resp = String(r).trim();
          if (/mrd/i.test(resp)) resp = 'MRD-';           // MRD-, MRDneg, MRD(-) 등 모두 허용
          if (m !== null) responses.push({ month: m, response: resp });
        }
      }

      const aes = [];
      for (let i = 1; i <= 10; i++) {
        const nm = row[`AE_name${i}`], d = row[`AE_date${i}`];
        if (nm && d) {
          const m = mo(d);
          if (m !== null) {
            const g = row[`AE_grade${i}`];
            aes.push({ month: m, name: String(nm).trim(), grade: (g !== undefined && g !== null && g !== '') ? String(g).trim() : null });
          }
        }
      }

      const asctMonth = row.ASCT_date ? mo(row.ASCT_date) : null;
      const deathMonth = row.Death_date ? mo(row.Death_date) : null;
      const lastRespMonth = responses.length ? Math.max(...responses.map(r => r.month)) : 0;

      let txStatus = String(row.Tx_status || '').trim().toLowerCase();
      if (!['ongoing', 'eot', 'dropout'].includes(txStatus)) txStatus = (deathMonth !== null) ? 'death' : 'ongoing';

      const endRaw = row.EOT_date || row.Dropout_date || row.LastDose_date;
      let treatEnd = (endRaw !== undefined && endRaw !== null && endRaw !== '') ? mo(endRaw) : null;
      if (treatEnd === null) treatEnd = (deathMonth !== null) ? deathMonth : Math.max(lastRespMonth, asctMonth || 0, 1);

      let lastFu = (row.LastFU_date !== undefined && row.LastFU_date !== null && row.LastFU_date !== '') ? mo(row.LastFU_date) : null;
      if (lastFu === null) lastFu = Math.max(lastRespMonth, deathMonth || 0, treatEnd);

      const rowEnd = Math.max(treatEnd, lastFu, deathMonth || 0, lastRespMonth, asctMonth || 0, 1);
      const name = (row.Name !== undefined && row.Name !== null && row.Name !== '') ? String(row.Name).trim() : (row.Patient_ID || `Patient ${index + 1}`);

      return {
        id: row.Patient_ID || `Patient ${index + 1}`,
        name,
        cohort: row.Cohort || 'Unknown',
        duration: rowEnd,
        responses,
        aes,
        asctMonth,
        deathMonth,
        txStatus,
        treatEnd,
        lastFu,
      };
    }).filter(Boolean);
  };

  const parseDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') {
      return new Date((value - 25569) * 86400 * 1000);
    }
    const parsed = new Date(value);
    return isNaN(parsed) ? null : parsed;
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = useCallback((e) => {
    const file = e.target.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const sortedData = useMemo(() => {
    if (!data) return null;
    
    let sorted = [...data];
    
    if (settings.sortBy === 'duration') {
      sorted.sort((a, b) => b.duration - a.duration);
    } else if (settings.sortBy === 'id') {
      sorted.sort((a, b) => a.id.localeCompare(b.id));
    }
    
    if (settings.groupByCohort) {
      const cohorts = {};
      sorted.forEach(patient => {
        if (!cohorts[patient.cohort]) cohorts[patient.cohort] = [];
        cohorts[patient.cohort].push(patient);
      });
      return Object.entries(cohorts).sort((a, b) => a[0].localeCompare(b[0]));
    }
    
    return [['All', sorted]];
  }, [data, settings]);

  const maxDuration = useMemo(() => {
    if (!data) return 21;
    return Math.ceil(Math.max(...data.map(d => d.duration)) / 3) * 3 + 3;
  }, [data]);

  const LEFT = 165, PW = 630;
  const X = (m) => LEFT + (m / maxDuration) * PW;
  const SUMX = 900, SUMH = 150, SBARW = 60;
  // AE 라벨 층 배치 — 시간상 가까운 AE 라벨이 좌우로 겹칠 때만 위로 한 층(13px)씩 올린다.
  // 층이 생긴 환자 줄만 그 층수만큼 간격이 넓어진다. 안 겹치면 간격 증가 없음.
  const AE_TIER_H = 13;
  const aeLayouts = useMemo(() => {
    const m = new Map();
    if (!data) return m;
    const est = (t) => t.length * 5.4 + 6;               // 9.5px 폰트 근사 폭
    data.forEach(p => {
      const ends = [];                                    // 층별 마지막 라벨의 오른쪽 끝 x
      const items = p.aes.slice().sort((a, b) => a.month - b.month).map(ae => {
        const ax = LEFT + (ae.month / maxDuration) * PW;
        const label = ae.name + (ae.grade ? ` Gr${ae.grade}` : '');
        const w = est(label);
        let tier = 0;
        while (ends[tier] !== undefined && ax - w / 2 < ends[tier] + 6) tier++;
        ends[tier] = ax + w / 2;
        return { ...ae, ax, label, tier };
      });
      m.set(p, { items, extra: items.length ? Math.max(...items.map(i => i.tier)) * AE_TIER_H : 0 });
    });
    return m;
  }, [data, maxDuration]);
  const RESP_ORDER = colors.sCR ? ['MRD-', 'sCR', 'CR', 'VGPR', 'PR'] : ['CR', 'PR'];
  const RANK = colors.sCR
    ? { 'MRD-': 8, sCR: 7, CR: 6, VGPR: 5, PR: 4, MR: 3, SD: 2, PD: 1 }
    : { CR: 4, PR: 3, SD: 2, PD: 1 };
  const showBrackets = !!colors.sCR;

  /* 범례 — 그림(SVG) 안 우측 세로 열. 화면과 SVG·PNG 내보내기가 항상 같다. */
  const LEGX = 1075;
  const Legend = () => {
    let y = 50;
    const out = [];
    const add = (el, label) => {
      out.push(<g key={label}>{el}<text x={LEGX + 16} y={y + 4} fontSize="11.5" fill="#333">{label}</text></g>);
      y += 21;
    };
    Object.keys(RANK).forEach(k => add(
      <g>
        <circle cx={LEGX} cy={y} r={5.5} fill={colors[k] || '#999'} />
        {k === 'MRD-' && <circle cx={LEGX} cy={y} r={2} fill="#fff" />}
      </g>, k === 'MRD-' ? 'MRD−' : k));
    y += 8;
    add(<polygon points={`${LEGX},${y - 6} ${LEGX + 6},${y} ${LEGX},${y + 6} ${LEGX - 6},${y}`} fill={colors.ASCT} />, 'ASCT');
    add(<g><line x1={LEGX - 5} y1={y - 5} x2={LEGX + 5} y2={y + 5} stroke={colors.Death} strokeWidth={2.5} /><line x1={LEGX + 5} y1={y - 5} x2={LEGX - 5} y2={y + 5} stroke={colors.Death} strokeWidth={2.5} /></g>, 'Death');
    add(<polygon points={`${LEGX - 5},${y - 5} ${LEGX + 6},${y} ${LEGX - 5},${y + 5}`} fill="#374151" />, 'Ongoing');
    add(<g><line x1={LEGX - 1} y1={y - 7} x2={LEGX - 1} y2={y + 7} stroke="#374151" strokeWidth={3} /><line x1={LEGX + 3} y1={y} x2={LEGX + 12} y2={y} stroke="#9AA0AA" strokeWidth={2} strokeDasharray="2 3" /></g>, 'EOT · FU');
    add(<g><line x1={LEGX - 5} y1={y + 6} x2={LEGX + 1} y2={y - 6} stroke="#374151" strokeWidth={2.5} /><line x1={LEGX} y1={y + 6} x2={LEGX + 6} y2={y - 6} stroke="#374151" strokeWidth={2.5} /></g>, 'Drop-out');
    add(<circle cx={LEGX} cy={y} r={4.5} fill="#111" />, 'AE');
    return <g>{out}</g>;
  };

  const downloadSVG = () => {
    const svg = document.getElementById('swimmer-plot-svg');
    if (!svg) return;
    
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'swimmer_plot_mm.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPNG = () => {
    const svg = document.getElementById('swimmer-plot-svg');
    if (!svg) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    canvas.width = svg.getBoundingClientRect().width * 4;   // 4배 — 발표 확대에도 선명
    canvas.height = svg.getBoundingClientRect().height * 4;
    
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'swimmer_plot_mm.png';
      a.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const totalPatients = sortedData 
    ? sortedData.reduce((sum, [_, patients]) => sum + patients.length, 0) 
    : 0;
  
  const svgHeight = sortedData
    ? Math.max(sortedData.reduce((sum, [, patients]) => sum + patients.reduce((s, p) => {
        const lay = aeLayouts.get(p);
        return s + settings.barHeight + settings.barGap + (lay ? lay.extra : 0);
      }, 0) + 40, 80), 430)
    : 400;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a0a2e 0%, #16213e 50%, #1a0a2e 100%)',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: '#e6f1ff',
      padding: '24px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Outfit:wght@300;400;600;700&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body { background: #1a0a2e; }
        
        .app-title {
          font-family: 'Outfit', sans-serif;
          font-weight: 700;
          font-size: 2.5rem;
          background: linear-gradient(135deg, #c084fc, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.5px;
        }
        
        .subtitle {
          font-family: 'Outfit', sans-serif;
          font-weight: 300;
          color: #a78bfa;
          margin-top: 8px;
          font-size: 1.1rem;
        }
        
        .disease-tag {
          display: inline-block;
          background: rgba(168, 85, 247, 0.2);
          border: 1px solid #a855f7;
          color: #c084fc;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-family: 'JetBrains Mono', monospace;
          margin-left: 12px;
          vertical-align: middle;
        }
        
        .upload-zone {
          border: 2px dashed #3b2063;
          border-radius: 16px;
          padding: 48px;
          text-align: center;
          transition: all 0.3s ease;
          background: rgba(26, 10, 46, 0.5);
          cursor: pointer;
        }
        
        .upload-zone:hover, .upload-zone.dragging {
          border-color: #a855f7;
          background: rgba(168, 85, 247, 0.05);
          transform: translateY(-2px);
        }
        
        .upload-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          color: #a855f7;
        }
        
        .btn {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          padding: 10px 20px;
          border: 1px solid #a855f7;
          background: transparent;
          color: #a855f7;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .btn:hover {
          background: rgba(168, 85, 247, 0.1);
        }
        
        .settings-panel {
          background: rgba(26, 10, 46, 0.8);
          border: 1px solid #3b2063;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
        }
        
        .settings-title {
          font-family: 'Outfit', sans-serif;
          font-weight: 600;
          font-size: 1rem;
          color: #e9d5ff;
          margin-bottom: 16px;
        }
        
        .settings-row {
          display: flex;
          flex-wrap: wrap;
          gap: 24px;
          align-items: center;
        }
        
        .setting-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .setting-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          color: #a78bfa;
        }
        
        select, input[type="range"] {
          background: #1a0a2e;
          border: 1px solid #3b2063;
          color: #e6f1ff;
          padding: 6px 12px;
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
        }
        
        select:focus, input:focus {
          outline: none;
          border-color: #a855f7;
        }
        
        .chart-container {
          background: #fff;
          border-radius: 12px;
          padding: 24px;
          overflow-x: auto;
        }
        
        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
          padding: 12px 16px;
          background: rgba(26, 10, 46, 0.05);
          border-radius: 8px;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          color: #333;
        }
        
        .error-box {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid #ff6b6b;
          border-radius: 8px;
          padding: 16px;
          color: #ff6b6b;
          margin-top: 16px;
        }
        
        .stats-bar {
          display: flex;
          gap: 32px;
          margin-bottom: 16px;
        }
        
        .stat-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: #a855f7;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .stat-label {
          font-size: 0.75rem;
          color: #a78bfa;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .btn-group {
          display: flex;
          gap: 8px;
          margin-left: auto;
        }
        
        .info-box {
          background: rgba(168, 85, 247, 0.1);
          padding: 16px;
          border-radius: 8px;
          max-width: 500px;
          margin: 24px auto 0;
          text-align: left;
        }
        
        .info-title {
          font-size: 0.8rem;
          color: #a855f7;
          margin-bottom: 8px;
          font-weight: 600;
        }
        
        .info-content {
          font-size: 0.75rem;
          color: #a78bfa;
          line-height: 1.6;
        }
        
        .info-content code { color: #c084fc; }
        
        footer {
          margin-top: 48px;
          text-align: center;
          color: #a78bfa;
          font-size: 0.8rem;
          font-family: 'JetBrains Mono', monospace;
        }
        
        @media (max-width: 768px) {
          .app-title { font-size: 1.8rem; }
          .settings-row { flex-direction: column; align-items: flex-start; }
          .btn-group { margin-left: 0; margin-top: 16px; width: 100%; }
          .btn-group .btn { flex: 1; }
        }
      `}</style>

      <header style={{ marginBottom: '32px' }}>
        <h1 className="app-title">
          Swimmer's Plot Generator
          <span className="disease-tag">Multiple Myeloma</span>
        </h1>
        <p className="subtitle">다발골수종 임상 연구를 위한 개별 환자 반응 시각화 도구</p>
      </header>

      {!data ? (
        <div
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input').click()}
        >
          <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 16v2a2 2 0 002 2h14a2 2 0 002-2v-2" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: '1.1rem', marginBottom: '8px', color: '#e9d5ff' }}>
            엑셀 또는 CSV 파일을 드래그하거나 클릭하여 업로드
          </p>
          <p style={{ fontSize: '0.85rem', color: '#a78bfa', marginBottom: '24px' }}>
            지원 형식: .xlsx, .xls, .csv
          </p>
          <div className="info-box">
            <p className="info-title">필요한 컬럼:</p>
            <p className="info-content">
              • <code>Cohort</code> - 코호트/Arm 구분 (선택)<br/>
              • <code>Patient_ID</code> - 환자 ID<br/>
              • <code>C1D1</code> - 치료 시작일<br/>
              • <code>Resp_date1, Response1, ...</code> - 반응 평가 (MRD-/sCR/CR/VGPR/PR/MR/SD/PD)<br/>
              • <code>ASCT_date</code> - ASCT 날짜 (선택)<br/>
              • <code>Death_date</code> - 사망 날짜 (선택)<br/>
              • <code>Name</code> - 환자 이름 (표시용, 선택)<br/>
              • <code>Tx_status</code> - ongoing / EOT / dropout (선택)<br/>
              • <code>LastDose_date</code> - 마지막 투여일=진행중(▶) 끝점 (선택)<br/>
              • <code>EOT_date</code> - 치료종료(EOT)일 = | 위치 (선택)<br/>
              • <code>Dropout_date</code> - 중도탈락일 = ⁄⁄ 위치 (선택)<br/>
              • <code>LastFU_date</code> - 마지막 추적일 (선택)<br/>
              • <code>AE_name1, AE_date1, AE_grade1, ...</code> - 부작용 (선택)
            </p>
          </div>
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
          {error && <div className="error-box">{error}</div>}
        </div>
      ) : (
        <>
          <div className="stats-bar" style={{ marginTop: '24px' }}>
            <div>
              <div className="stat-value">{totalPatients}</div>
              <div className="stat-label">Total Patients</div>
            </div>
            <div>
              <div className="stat-value">{sortedData?.length || 0}</div>
              <div className="stat-label">Cohorts</div>
            </div>
            <div>
              <div className="stat-value">{(maxDuration - 3).toFixed(0)}</div>
              <div className="stat-label">Max Duration (mo)</div>
            </div>
          </div>

          <div className="settings-panel">
            <div className="settings-title">Settings</div>
            <div className="settings-row">
              <div className="setting-item">
                <span className="setting-label">Sort by:</span>
                <select 
                  value={settings.sortBy}
                  onChange={(e) => setSettings(s => ({ ...s, sortBy: e.target.value }))}
                >
                  <option value="duration">Duration</option>
                  <option value="id">Patient ID</option>
                </select>
              </div>
              
              <div className="setting-item">
                <span className="setting-label">Group by Cohort:</span>
                <input 
                  type="checkbox" 
                  checked={settings.groupByCohort}
                  onChange={(e) => setSettings(s => ({ ...s, groupByCohort: e.target.checked }))}
                  style={{ width: '18px', height: '18px' }}
                />
              </div>
              
              <div className="setting-item">
                <span className="setting-label">Bar Height:</span>
                <input 
                  type="range" 
                  min="12" 
                  max="32" 
                  value={settings.barHeight}
                  onChange={(e) => setSettings(s => ({ ...s, barHeight: parseInt(e.target.value) }))}
                />
                <span style={{ color: '#a855f7', fontSize: '0.8rem', minWidth: '35px' }}>{settings.barHeight}px</span>
              </div>

              <div className="btn-group">
                <button className="btn" onClick={downloadSVG}>SVG</button>
                <button className="btn" onClick={downloadPNG}>PNG</button>
                <button className="btn" onClick={() => setData(null)}>New File</button>
              </div>
            </div>
          </div>

          <div className="chart-container">
            <svg 
              id="swimmer-plot-svg"
              width="1180" 
              height={svgHeight}
              style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
            >
              <rect width="1180" height={svgHeight} fill="#ffffff" />
              <Legend />
              {settings.showGrid && Array.from({ length: Math.floor(maxDuration / 3) + 1 }, (_, i) => i * 3).map(month => (
                <line key={month} x1={X(month)} y1={40} x2={X(month)} y2={svgHeight - 40} stroke="#e0e0e0" strokeDasharray="4,4"/>
              ))}

              <line x1={LEFT} y1={svgHeight - 40} x2={LEFT + PW} y2={svgHeight - 40} stroke="#333" strokeWidth="1"/>

              {Array.from({ length: Math.floor(maxDuration / 3) + 1 }, (_, i) => i * 3).map(month => (
                <g key={month}>
                  <line x1={X(month)} y1={svgHeight - 40} x2={X(month)} y2={svgHeight - 35} stroke="#333"/>
                  <text x={X(month)} y={svgHeight - 20} textAnchor="middle" fontSize="12" fill="#333">{month}</text>
                </g>
              ))}

              <text x={LEFT + PW / 2} y={svgHeight - 2} textAnchor="middle" fontSize="13" fill="#333" fontWeight="500">
                Time on treatment (months)
              </text>

              <text x={SUMX} y={20} textAnchor="middle" fontSize="13" fontWeight="700" fill="#333">Best response</text>

              {sortedData && (() => {
                let yOffset = 50;
                return sortedData.map(([cohort, patients]) => {
                  const cohortStart = yOffset;
                  let py = yOffset;
                  const rowPos = patients.map(p => {
                    const lay = aeLayouts.get(p) || { items: [], extra: 0 };
                    const y = py + lay.extra;             // 라벨 공간을 위에 확보
                    py += settings.barHeight + settings.barGap + lay.extra;
                    return { y, lay };
                  });
                  const cohortBars = patients.map((patient, idx) => {
                    const { y, lay } = rowPos[idx];
                    const cy = y + settings.barHeight / 2;
                    const treatX = X(patient.treatEnd);
                    const st = patient.txStatus;
                    const mk = '#374151';
                    return (
                      <g key={patient.id}>
                        <text x={LEFT - 10} y={cy + 4} textAnchor="end" fontSize="11" fill="#333">{patient.name}</text>

                        <rect x={LEFT} y={y} width={Math.max(treatX - LEFT, 0)} height={settings.barHeight} fill={colors.bar} rx={3} opacity={0.9}/>

                        {st === 'eot' && patient.lastFu > patient.treatEnd && (
                          <line x1={treatX} y1={cy} x2={X(patient.lastFu)} y2={cy} stroke="#9AA0AA" strokeWidth="2" strokeDasharray="2 4"/>
                        )}

                        {patient.responses.map((resp, i) => (
                          <g key={i}>
                            <circle cx={X(resp.month)} cy={cy} r={6} fill={colors[resp.response] || '#999'} stroke="#fff" strokeWidth="1"/>
                            {resp.response === 'MRD-' && <circle cx={X(resp.month)} cy={cy} r={2.1} fill="#fff"/>}
                          </g>
                        ))}

                        {patient.asctMonth != null && (
                          <polygon points={`${X(patient.asctMonth)},${cy - 7} ${X(patient.asctMonth) + 7},${cy} ${X(patient.asctMonth)},${cy + 7} ${X(patient.asctMonth) - 7},${cy}`} fill={colors.ASCT} stroke="#fff" strokeWidth="1"/>
                        )}

                        {lay.items.map((ae, i) => {
                          const topY = y - 4 - ae.tier * AE_TIER_H;
                          return (
                            <g key={`ae${i}`}>
                              <line x1={ae.ax} y1={cy} x2={ae.ax} y2={topY} stroke="#111" strokeWidth="1.2" opacity="0.75"/>
                              <text x={ae.ax} y={topY - 3} textAnchor="middle" fontSize="9.5" fill="#111">{ae.label}</text>
                              <circle cx={ae.ax} cy={cy} r={4.5} fill="#111" stroke="#fff" strokeWidth="1.2"/>
                            </g>
                          );
                        })}

                        {st === 'ongoing' && (
                          <polygon points={`${treatX + 8},${cy - 6} ${treatX + 19},${cy} ${treatX + 8},${cy + 6}`} fill={mk}/>
                        )}
                        {st === 'eot' && (
                          <line x1={treatX} y1={cy - 11} x2={treatX} y2={cy + 11} stroke={mk} strokeWidth="3.5"/>
                        )}
                        {st === 'dropout' && (
                          <g>
                            <line x1={treatX - 4} y1={cy + 10} x2={treatX + 4} y2={cy - 10} stroke={mk} strokeWidth="3"/>
                            <line x1={treatX + 4} y1={cy + 10} x2={treatX + 12} y2={cy - 10} stroke={mk} strokeWidth="3"/>
                          </g>
                        )}

                        {patient.deathMonth != null && (
                          <g>
                            <line x1={X(patient.deathMonth) - 5} y1={cy - 5} x2={X(patient.deathMonth) + 5} y2={cy + 5} stroke={colors.Death} strokeWidth="2.5"/>
                            <line x1={X(patient.deathMonth) + 5} y1={cy - 5} x2={X(patient.deathMonth) - 5} y2={cy + 5} stroke={colors.Death} strokeWidth="2.5"/>
                          </g>
                        )}
                      </g>
                    );
                  });

                  const cohortHeight = py - cohortStart;
                  yOffset += cohortHeight + 40;

                  const bandCY = cohortStart + cohortHeight / 2;
                  const nSum = patients.length;
                  const cnt = {};
                  patients.forEach(p => {
                    let best = null, br = -1;
                    p.responses.forEach(r => { const rk = RANK[r.response]; if (rk !== undefined && rk > br) { br = rk; best = r.response; } });
                    if (best && RESP_ORDER.includes(best)) cnt[best] = (cnt[best] || 0) + 1;
                  });
                  const pct = {}; RESP_ORDER.forEach(k => { pct[k] = nSum ? (cnt[k] || 0) / nSum * 100 : 0; });
                  const orr = RESP_ORDER.reduce((sum, k) => sum + pct[k], 0);
                  const geCR = (pct['MRD-'] || 0) + (pct.sCR || 0) + (pct.CR || 0);
                  const geVGPR = geCR + (pct.VGPR || 0);
                  const sumH = Math.min(SUMH, Math.max(cohortHeight - 10, 60));   // 코호트 밴드보다 커지지 않게
                  const sBottom = bandCY + sumH / 2;
                  const sY = (p) => sBottom - p * sumH / 100;
                  let scum = 0;
                  const segs = RESP_ORDER.map(k => { const v = pct[k]; const seg = { k, v, y0: sY(scum + v), y1: sY(scum) }; scum += v; return seg; });

                  return (
                    <g key={cohort}>
                      {settings.groupByCohort && sortedData.length > 1 && (
                        <>
                          <text x={28} y={cohortStart + cohortHeight / 2} textAnchor="middle" fontSize="14" fontWeight="600" fill="#333" transform={`rotate(-90, 28, ${cohortStart + cohortHeight / 2})`}>
                            {cohort}
                          </text>
                          <path d={`M 46 ${cohortStart} L 51 ${cohortStart} L 51 ${cohortStart + cohortHeight - settings.barGap} L 46 ${cohortStart + cohortHeight - settings.barGap}`} stroke="#666" strokeWidth="1" fill="none"/>
                        </>
                      )}
                      {cohortBars}

                      <line x1={SUMX - SBARW / 2} y1={sY(100)} x2={SUMX + SBARW / 2} y2={sY(100)} stroke="#e5e5e5" strokeDasharray="3 3"/>
                      <line x1={SUMX - SBARW / 2} y1={sY(0)} x2={SUMX + SBARW / 2} y2={sY(0)} stroke="#999"/>
                      {segs.filter(sg => sg.v > 0).map(sg => (
                        <g key={`sum-${sg.k}`}>
                          <rect x={SUMX - SBARW / 2} y={sg.y0} width={SBARW} height={Math.max(sg.y1 - sg.y0, 0)} fill={colors[sg.k]} stroke="#fff" strokeWidth="1"/>
                          {sg.v >= 6 && (
                            <text x={SUMX} y={(sg.y0 + sg.y1) / 2 + 4} textAnchor="middle" fontSize={`${sg.k} ${Math.round(sg.v)}%`.length > 8 ? 9 : 10.5} fill={(sg.k === 'MRD-' || sg.k === 'sCR' || sg.k === 'CR') ? '#fff' : '#1a1a1a'}>{sg.k === 'MRD-' ? 'MRD−' : sg.k} {Math.round(sg.v)}%</text>
                          )}
                        </g>
                      ))}
                      <text x={SUMX} y={sY(orr) - 9} textAnchor="middle" fontSize="13" fontWeight="700" fill="#111">ORR {orr.toFixed(1)}%</text>
                      {showBrackets && geCR > 0 && (
                        <>
                          <path d={`M ${SUMX - SBARW / 2 - 8} ${sY(0)} L ${SUMX - SBARW / 2 - 14} ${sY(0)} L ${SUMX - SBARW / 2 - 14} ${sY(geCR)} L ${SUMX - SBARW / 2 - 8} ${sY(geCR)}`} fill="none" stroke="#555" strokeWidth="1.2"/>
                          <text x={SUMX - SBARW / 2 - 17} y={sY(geCR / 2) - 1} textAnchor="end" fontSize="10" fill="#333">≥CR</text>
                          <text x={SUMX - SBARW / 2 - 17} y={sY(geCR / 2) + 11} textAnchor="end" fontSize="10" fill="#333">{geCR.toFixed(0)}%</text>
                        </>
                      )}
                      {showBrackets && geVGPR > 0 && (
                        <>
                          <path d={`M ${SUMX + SBARW / 2 + 8} ${sY(0)} L ${SUMX + SBARW / 2 + 14} ${sY(0)} L ${SUMX + SBARW / 2 + 14} ${sY(geVGPR)} L ${SUMX + SBARW / 2 + 8} ${sY(geVGPR)}`} fill="none" stroke="#555" strokeWidth="1.2"/>
                          <text x={SUMX + SBARW / 2 + 17} y={sY(geVGPR / 2) - 1} fontSize="10" fill="#333">≥VGPR</text>
                          <text x={SUMX + SBARW / 2 + 17} y={sY(geVGPR / 2) + 11} fontSize="10" fill="#333">{geVGPR.toFixed(0)}%</text>
                        </>
                      )}
                    </g>
                  );
                });
              })()}
            </svg>
          </div>
        </>
      )}
      
      <footer>
        Swimmer's Plot Generator for Multiple Myeloma Clinical Research
      </footer>
    </div>
  );
};

export default App;
