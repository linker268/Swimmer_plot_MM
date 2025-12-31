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
    barGap: 8,
  });

  // MM Response criteria colors
  const colors = {
    sCR: '#1a7431',   // Stringent CR - 진한 초록
    CR: '#2E9B6F',    // Complete Response - 초록
    VGPR: '#7CB342',  // Very Good PR - 연두
    PR: '#F5C342',    // Partial Response - 노랑
    MR: '#FF9800',    // Minimal Response - 주황
    SD: '#7FBADC',    // Stable Disease - 파란색
    PD: '#8B8B8B',    // Progressive Disease - 회색
    ASCT: '#9B59B6',  // ASCT - 보라
    bar: '#87CEEB',
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
    return rawData.map((row, index) => {
      const c1d1 = parseDate(row.C1D1);
      if (!c1d1) return null;

      const responses = [];
      for (let i = 1; i <= 10; i++) {
        const dateKey = `Resp_date${i}`;
        const respKey = `Response${i}`;
        if (row[dateKey] && row[respKey]) {
          const respDate = parseDate(row[dateKey]);
          if (respDate) {
            const months = (respDate - c1d1) / (1000 * 60 * 60 * 24 * 30.44);
            responses.push({
              month: months,
              response: row[respKey],
            });
          }
        }
      }

      let asctMonth = null;
      if (row.ASCT_date) {
        const asctDate = parseDate(row.ASCT_date);
        if (asctDate) {
          asctMonth = (asctDate - c1d1) / (1000 * 60 * 60 * 24 * 30.44);
        }
      }

      const lastResponseDate = responses.length > 0 
        ? Math.max(...responses.map(r => r.month))
        : 0;
      
      const duration = Math.max(lastResponseDate, asctMonth || 0, 1);

      return {
        id: row.Patient_ID || `Patient ${index + 1}`,
        cohort: row.Cohort || 'Unknown',
        duration,
        responses,
        asctMonth,
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
    
    canvas.width = 1800;
    canvas.height = svg.getBoundingClientRect().height * 2;
    
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
    ? sortedData.reduce((sum, [cohort, patients]) => {
        return sum + patients.length * (settings.barHeight + settings.barGap) + 40;
      }, 80)
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
              • <code>Resp_date1, Response1, ...</code> - 반응 평가 (sCR/CR/VGPR/PR/MR/SD/PD)<br/>
              • <code>ASCT_date</code> - ASCT 날짜 (선택)
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
            <div className="legend">
              <div className="legend-item">
                <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill={colors.sCR}/></svg>
                <span>sCR (Stringent CR)</span>
              </div>
              <div className="legend-item">
                <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill={colors.CR}/></svg>
                <span>CR (Complete Response)</span>
              </div>
              <div className="legend-item">
                <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill={colors.VGPR}/></svg>
                <span>VGPR (Very Good PR)</span>
              </div>
              <div className="legend-item">
                <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill={colors.PR}/></svg>
                <span>PR (Partial Response)</span>
              </div>
              <div className="legend-item">
                <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill={colors.MR}/></svg>
                <span>MR (Minimal Response)</span>
              </div>
              <div className="legend-item">
                <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill={colors.SD}/></svg>
                <span>SD (Stable Disease)</span>
              </div>
              <div className="legend-item">
                <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill={colors.PD}/></svg>
                <span>PD (Progressive Disease)</span>
              </div>
              <div className="legend-item">
                <svg width="14" height="14">
                  <polygon points="7,1 13,7 7,13 1,7" fill={colors.ASCT}/>
                </svg>
                <span>ASCT</span>
              </div>
            </div>

            <svg 
              id="swimmer-plot-svg"
              width="900" 
              height={svgHeight}
              style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
            >
              {settings.showGrid && Array.from({ length: Math.floor(maxDuration / 3) + 1 }, (_, i) => i * 3).map(month => (
                <line
                  key={month}
                  x1={100 + (month / maxDuration) * 700}
                  y1={40}
                  x2={100 + (month / maxDuration) * 700}
                  y2={svgHeight - 40}
                  stroke="#e0e0e0"
                  strokeDasharray="4,4"
                />
              ))}

              <line x1="100" y1={svgHeight - 40} x2="800" y2={svgHeight - 40} stroke="#333" strokeWidth="1"/>
              
              {Array.from({ length: Math.floor(maxDuration / 3) + 1 }, (_, i) => i * 3).map(month => (
                <g key={month}>
                  <line
                    x1={100 + (month / maxDuration) * 700}
                    y1={svgHeight - 40}
                    x2={100 + (month / maxDuration) * 700}
                    y2={svgHeight - 35}
                    stroke="#333"
                  />
                  <text
                    x={100 + (month / maxDuration) * 700}
                    y={svgHeight - 20}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#333"
                  >
                    {month}
                  </text>
                </g>
              ))}
              
              <text
                x={450}
                y={svgHeight - 2}
                textAnchor="middle"
                fontSize="13"
                fill="#333"
                fontWeight="500"
              >
                Time on treatment (months)
              </text>

              {sortedData && (() => {
                let yOffset = 50;
                return sortedData.map(([cohort, patients]) => {
                  const cohortStart = yOffset;
                  const cohortBars = patients.map((patient, idx) => {
                    const y = yOffset + idx * (settings.barHeight + settings.barGap);
                    const barWidth = (patient.duration / maxDuration) * 700;
                    
                    return (
                      <g key={patient.id}>
                        <rect
                          x={100}
                          y={y}
                          width={barWidth}
                          height={settings.barHeight}
                          fill={colors.bar}
                          rx={3}
                          opacity={0.85}
                        />
                        
                        {patient.responses.map((resp, i) => {
                          const cx = 100 + (resp.month / maxDuration) * 700;
                          const cy = y + settings.barHeight / 2;
                          return (
                            <circle
                              key={i}
                              cx={cx}
                              cy={cy}
                              r={6}
                              fill={colors[resp.response] || '#999'}
                              stroke="#fff"
                              strokeWidth="1"
                            />
                          );
                        })}
                        
                        {patient.asctMonth && (
                          <polygon
                            points={`${100 + (patient.asctMonth / maxDuration) * 700},${y + settings.barHeight / 2 - 7} ${100 + (patient.asctMonth / maxDuration) * 700 + 7},${y + settings.barHeight / 2} ${100 + (patient.asctMonth / maxDuration) * 700},${y + settings.barHeight / 2 + 7} ${100 + (patient.asctMonth / maxDuration) * 700 - 7},${y + settings.barHeight / 2}`}
                            fill={colors.ASCT}
                            stroke="#fff"
                            strokeWidth="1"
                          />
                        )}
                      </g>
                    );
                  });
                  
                  const cohortHeight = patients.length * (settings.barHeight + settings.barGap);
                  yOffset += cohortHeight + 40;
                  
                  return (
                    <g key={cohort}>
                      {settings.groupByCohort && sortedData.length > 1 && (
                        <>
                          <text
                            x={50}
                            y={cohortStart + cohortHeight / 2}
                            textAnchor="middle"
                            fontSize="14"
                            fontWeight="600"
                            fill="#333"
                            transform={`rotate(-90, 50, ${cohortStart + cohortHeight / 2})`}
                          >
                            {cohort === 'A' ? 'Arm A' : cohort === 'B' ? 'Arm B' : cohort}
                          </text>
                          <path
                            d={`M 70 ${cohortStart} L 75 ${cohortStart} L 75 ${cohortStart + cohortHeight - settings.barGap} L 70 ${cohortStart + cohortHeight - settings.barGap}`}
                            stroke="#666"
                            strokeWidth="1"
                            fill="none"
                          />
                        </>
                      )}
                      {cohortBars}
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
