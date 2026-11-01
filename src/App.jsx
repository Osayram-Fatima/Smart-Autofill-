/* global chrome */
import { useState, useEffect } from "react";
import "./App.css";

const sendToActiveTab = (action, extra = {}) => {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0)
        return resolve({ ok: false, error: "No active tab." });
      
      chrome.tabs.sendMessage(tabs[0].id, { action, ...extra }, (resp) => {
        if (chrome.runtime.lastError)
          return resolve({
            ok: false,
            error: "Content script not reachable. Please reload the page.",
          });
        if (!resp) return resolve({ ok: false, error: "No response." });
        if (!resp.ok) return resolve(resp);
        resolve(resp.data || { ok: false, error: "Empty response" });
      });
    });
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState("students");
  const [students, setStudents] = useState({ 
    headers: [], 
    rows: [], 
    fileName: "" 
  });
  const [studentImages, setStudentImages] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editErrors, setEditErrors] = useState({});
  const [site, setSite] = useState({ 
    hostname: "", 
    fields: [], 
    suggestions: [] 
  });
  
  const [globalError, setGlobalError] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [fillResults, setFillResults] = useState([]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [batchActive, setBatchActive] = useState(false);
  const [batchIndex, setBatchIndex] = useState(0);

      useEffect(() => {
    const loadData = async () => {
      // 1. Chrome Storage se Data wapis layein
      if (window.StorageMgr) {
        const saved = await window.StorageMgr.getStudents();
        if (saved && saved.rows && saved.rows.length > 0) {
          setStudents(saved);
        }
      }

      // 2. Current Site detect karein aur Mappings layein
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.url) {
          try {
            const u = new URL(tabs[0].url);
            const hostname = u.hostname;
            setSite((prev) => ({ ...prev, hostname }));

            if (window.StorageMgr) {
              const savedMappings = await window.StorageMgr.getMappings(hostname);
              if (savedMappings && savedMappings.mappings && savedMappings.mappings.length > 0) {
                setSite((prev) => ({
                  ...prev,
                  suggestions: savedMappings.mappings.map((m) => ({
                    ...m,
                    confidence: 100,
                    reasons: ["saved mapping"],
                    needsReview: false,
                  })),
                }));
              }
            }
          } catch (e) {}
        }
      });
    };

    loadData();

    // 3. NAYA CODE: Jab bhi tab update ho (jaise naya form khule), toh data wapis load karein
    const handleTabUpdate = (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        loadData();
      }
    };

    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(handleTabUpdate);
    }

    // Cleanup
    return () => {
      if (chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.removeListener(handleTabUpdate);
      }
    };
  }, []);
 
  const handleFileUpload = async (e) => {
    setGlobalError(null);
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const parsed = await window.ExcelMgr.parseFile(file);
      setStudents(parsed);
      setCurrentIndex(0);
      if (window.StorageMgr) await window.StorageMgr.setStudents(parsed);
      setStatusMsg(`Imported ${parsed.rows.length} students successfully.`);
    } catch (err) {
      setGlobalError("Import failed: " + err.message);
    }
  };

  const handleImagesUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const newImages = { ...studentImages };
    let count = 0;

    files.forEach((file) => {
      const rawName = file.name.split(".")[0].toLowerCase().trim();
      const reader = new FileReader();
      
      reader.onload = (event) => {
        newImages[rawName] = {
          url: event.target.result,
          fileName: file.name,
        };
        count++;
        
        if (count === files.length) {
          setStudentImages(newImages);
          setStatusMsg(`Loaded ${files.length} images successfully.`);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleScan = async () => {
    setGlobalError(null);
    setStatusMsg("Scanning...");
    
    try {
      const res = await sendToActiveTab("SCAN");
      if (res.ok === false) throw new Error(res.error);
      
      setSite((prev) => ({ ...prev, fields: res.fields || [] }));
      setStatusMsg(`Detected ${res.fields?.length || 0} fields.`);
    } catch (err) {
      setStatusMsg("");
      setGlobalError("Scan Failed: " + err.message);
    }
  };

  const handleSuggest = async () => {
    setGlobalError(null);
    setStatusMsg("Suggesting...");
    
    try {
      const res = await sendToActiveTab("SUGGEST", { headers: students.headers });
      if (res.ok === false) throw new Error(res.error);
      
      setSite((prev) => ({
        ...prev,
        fields: res.fields || prev.fields,
        suggestions: res.suggestions || [],
      }));
      setStatusMsg(`${res.suggestions?.length || 0} suggestions loaded.`);
    } catch (err) {
      setStatusMsg("");
      setGlobalError("Suggest Failed: " + err.message);
    }
  };

  const handleSaveMappings = async () => {
    setGlobalError(null);
    
    try {
      const mappings = site.suggestions
        .filter((s) => s.fieldUid)
        .map((s) => ({
          column: s.column,
          fieldUid: s.fieldUid,
          fieldUid2: s.fieldUid2 || null,
          confidence: 100,
        }));
        
      const res = await sendToActiveTab("SAVE_MAPPINGS", { mappings });
      if (res.ok === false) throw new Error(res.error);
      
      setStatusMsg(`Saved ${res.count} mappings for this site.`);
    } catch (err) {
      setGlobalError("Save Failed: " + err.message);
    }
  };

  const handleManualMapChange = (column, fieldUid) => {
    setSite((prev) => {
      const newSuggestions = prev.suggestions.map((s) => {
        if (s.column === column) {
          if (!fieldUid) {
            return {
              ...s,
              fieldUid: null,
              fieldUid2: null,
              fieldLabel: "",
              confidence: 0,
            };
          }
          const f = prev.fields.find((x) => x.uid === fieldUid);
          return {
            ...s,
            fieldUid: fieldUid,
            fieldLabel: f ? f.label || f.name || f.id : "",
            confidence: 100,
            needsReview: false,
          };
        }
        return s;
      });
      return { ...prev, suggestions: newSuggestions };
    });
  };

  const handleFill = async () => {
    setGlobalError(null);
    
    try {
      if (!students.rows.length) {
        throw new Error("Excel data nahi mila. Please upload file first.");
      }
      if (!site.suggestions.length) {
        throw new Error("Mappings nahi mili. Please go to Setup tab first.");
      }

      const studentRow = students.rows[currentIndex];
      
      const orderOfImportance = [
        "category", "sub category", "division", 
        "district", "tehsil", "gender", "date", "dob"
      ];
      
      const sortedSuggestions = [...site.suggestions].sort((a, b) => {
        const aIndex = orderOfImportance.findIndex((prefix) =>
          a.column.toLowerCase().includes(prefix)
        );
        const bIndex = orderOfImportance.findIndex((prefix) =>
          b.column.toLowerCase().includes(prefix)
        );
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      });

      const mappingPlan = sortedSuggestions
        .filter((s) => s.fieldUid)
        .map((s) => ({
          column: s.column,
          fieldUid: s.fieldUid,
          fieldUid2: s.fieldUid2 || null,
          fieldLabel: s.fieldLabel || "",
        }));

      setFillResults([
        { column: "System", ok: false, reason: "Filling data, please wait..." }
      ]);

      const res = await sendToActiveTab("FILL", { studentRow, mappingPlan });
      if (res.ok === false) throw new Error(res.error);

      if (!res.results || res.results.length === 0) {
        setFillResults([{ column: "System", ok: false, reason: "No fields were filled." }]);
      } else {
        setFillResults(res.results);
      }
    } catch (err) {
      setFillResults([]);
      setGlobalError("Fill Failed: " + err.message);
    }
  };

  const handleSubmitPage = () => {
    setGlobalError(null);
    if (!students.rows.length) {
      setGlobalError("No student data loaded. Please upload Excel file.");
      return;
    }
    setShowSubmitModal(true);
  };

    const handleUpdateField = async (resultIndex, newValue) => {
    setEditErrors((prev) => ({ ...prev, [resultIndex]: null }));
    const result = fillResults[resultIndex];
    if (!result.column) return;

    const updatePlan = [
      {
        fieldUid: result.uid,
        column: result.column,
        fieldLabel: result.fieldLabel || result.column,
      },
    ];
    const studentData = { [result.column]: newValue };

        try {
      const res = await sendToActiveTab("FILL", {
        studentRow: studentData,
        mappingPlan: updatePlan,
      });
      
      // Agar response hi nahi mila ya connection fail hua
      if (!res) {
         throw new Error("Connection lost. Please refresh the page.");
      }

      if (res.ok === false) {
         throw new Error(res.error);
      }
      
      if (res.results && res.results[0]) {
        if (res.results[0].ok) {
          const newStudents = { ...students };
          newStudents.rows[currentIndex][result.column] = newValue;
          setStudents(newStudents);
          
          if (window.StorageMgr) await window.StorageMgr.setStudents(newStudents);

          const newResults = [...fillResults];
          newResults[resultIndex] = { ...result, ok: true, reason: "" };
          setFillResults(newResults);
        } else {
          // Agar website ne accept nahi kiya
          setEditErrors((prev) => ({
            ...prev,
            [resultIndex]: res.results[0].reason || "Website did not accept this value.",
          }));
        }
      }
    } catch (err) {
      setEditErrors((prev) => ({
        ...prev,
        [resultIndex]: err.message || "Error connecting to page.",
      }));
    }
  };

  const startBatch = () => {
    setGlobalError(null);
    if (!students.rows.length) {
      setGlobalError("No data loaded. Please upload Excel file first.");
      return;
    }
    setBatchActive(true);
    setBatchIndex(currentIndex);
    setActiveTab("autofill");
    handleFill();
  };

  const nextBatch = async () => {
    const nextIndex = batchIndex + 1;
    if (nextIndex >= students.rows.length) {
      setBatchActive(false);
      setStatusMsg("Batch complete! All students processed.");
      return;
    }
    
    await sendToActiveTab("CLEAR");
    setBatchIndex(nextIndex);
    setCurrentIndex(nextIndex);
    setFillResults([]);
    
    setTimeout(() => {
      handleFill();
    }, 500);
  };

  return (
    <div className="app-container">
      <header>
        <h1>Smart Form Autofill</h1>
        <div className="muted small">Site: {site.hostname}</div>
      </header>

      {/* GLOBAL ERROR DISPLAY (Exception Handling) */}
      {globalError && (
        <div style={{ background: '#ef4444', color: 'white', padding: '10px', borderRadius: '6px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>⚠ {globalError}</span>
          <button onClick={() => setGlobalError(null)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>
      )}

      <nav className="tabs">
        {["students", "setup", "autofill", "settings"].map((t) => (
          <button
            key={t}
            className={`tab ${activeTab === t ? "active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {/* STUDENTS TAB */}
      {activeTab === "students" && (
        <div className="tab-panel">
          <div style={{ marginBottom: "15px" }}>
            <span style={{ fontSize: "13px", fontWeight: "bold", display: "block", marginBottom: "5px" }}>
              1. Upload Excel Data:
            </span>
            <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
          </div>

          <div style={{ marginBottom: "15px" }}>
            <span style={{ fontSize: "13px", fontWeight: "bold", display: "block", marginBottom: "5px" }}>
              2. Upload  Pictures (Select All):
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImagesUpload}
              style={{ width: "100%", background: "#1e293b", color: "#fff", padding: "8px", borderRadius: "6px", border: "1px solid #30363d" }}
            />
            {Object.keys(studentImages).length > 0 && (
              <div style={{ color: "#10b981", fontSize: "12px", marginTop: "5px" }}>
                ✓ {Object.keys(studentImages).length} pictures loaded and mapped.
              </div>
            )}
          </div>

          {students.rows.length > 0 && (
            <div style={{ marginTop: "8px", color: "#10b981", fontSize: "12px" }}>
              ✓ Data loaded from memory ({students.rows.length} students).
            </div>
          )}
          
          {students.rows.length > 0 && (
            <div className="card">
              <div className="flex-row" style={{ justifyContent: "space-between" }}>
                <span>Student {currentIndex + 1} of {students.rows.length}</span>
                <div>
                  <button
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    disabled={currentIndex === 0}
                    style={{ marginRight: "5px" }}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setCurrentIndex((i) => Math.min(students.rows.length - 1, i + 1))}
                    disabled={currentIndex === students.rows.length - 1}
                  >
                    Next
                  </button>
                </div>
              </div>
              <dl>
                {students.headers.slice(0, 5).map((h) => (
                  <div key={h} className="kv">
                    <dt>{h}:</dt> <dd>{students.rows[currentIndex][h]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* SETUP TAB */}
      {activeTab === "setup" && (
        <div className="tab-panel">
          <div className="flex-row">
            <button onClick={handleScan}>Scan Page</button>
            <button onClick={handleSuggest} disabled={!students.rows.length}>
              Suggest Mappings
            </button>
            <button onClick={handleSaveMappings} className="btn-success">
              Save Mappings
            </button>
          </div>
          <p className="small">{statusMsg}</p>

          <div className="mappings-list">
            {site.suggestions.map((s) => (
              <div
                key={s.column}
                className={`list-item ${s.confidence >= 70 ? "conf-ok" : s.confidence > 0 ? "conf-warn" : ""}`}
              >
                <div style={{ marginBottom: "6px" }}>
                  <strong>{s.column}</strong>
                </div>

                <select
                  value={s.fieldUid || ""}
                  onChange={(e) => handleManualMapChange(s.column, e.target.value)}
                  className="map-select"
                >
                  <option value="">— Select Field —</option>
                  {site.fields.map((f) => (
                    <option key={f.uid} value={f.uid}>
                      {f.label || f.name || f.id || f.placeholder || "(unlabeled)"} [{f.type}]
                    </option>
                  ))}
                </select>

                {(s.column.toLowerCase().includes("phone") ||
                  s.column.toLowerCase().includes("mobile") ||
                  s.column.toLowerCase().includes("date") ||
                  s.column.toLowerCase().includes("dob")) && s.fieldUid && (
                  <div style={{ marginTop: "6px" }}>
                    <span style={{ fontSize: "11px", color: "#8b949e", marginBottom: "4px", display: "block" }}>
                      Optional: Second field (e.g., Country Code)
                    </span>
                    <select
                      value={s.fieldUid2 || ""}
                      onChange={(e) => {
                        setSite((prev) => {
                          const newSug = prev.suggestions.map((x) => {
                            if (x.column === s.column) {
                              const f = prev.fields.find((uid) => uid.uid === e.target.value);
                              return {
                                ...x,
                                fieldUid2: e.target.value,
                                fieldLabel2: f ? f.label : "",
                              };
                            }
                            return x;
                          });
                          return { ...prev, suggestions: newSug };
                        });
                      }}
                      className="map-select"
                    >
                      <option value="">— None —</option>
                      {site.fields.map((f) => (
                        <option key={f.uid} value={f.uid}>
                          {f.label || f.name || f.id || f.placeholder || "(unlabeled)"} [{f.type}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AUTOFILL TAB */}
      {activeTab === "autofill" && (
        <div className="tab-panel">
          <div className="card" style={{ marginBottom: "15px", backgroundColor: "#1e293b", border: "1px solid #3b82f6" }}>
            <div style={{ color: "#8b949e", fontSize: "12px", marginBottom: "4px" }}>
              Ready to fill:
            </div>
            <div style={{ fontWeight: "bold", fontSize: "15px", color: "#fff" }}>
              Student {currentIndex + 1} of {students.rows.length}
            </div>
            
            {students.rows.length > 0 && (() => {
              const nameHeader = students.headers.find(
                (h) => h.toLowerCase().includes("full name") || h.toLowerCase().includes("student name") || h.toLowerCase() === "name"
              ) || students.headers[0];

              return (
                <div style={{ marginTop: "4px", fontSize: "13px", color: "#10b981" }}>
                  {students.rows[currentIndex][nameHeader] || "Unknown"}
                </div>
              );
            })()}

            {students.rows.length > 0 && (() => {
              const nameHeader = students.headers.find(
                (h) => h.toLowerCase().includes("full name") || h.toLowerCase().includes("student name") || h.toLowerCase() === "name"
              ) || students.headers[0];

              const studentName = (students.rows[currentIndex][nameHeader] || "").toLowerCase().trim();
              const img = studentImages[studentName];

              if (!img) return null;

              return (
                <div style={{ marginTop: "12px", borderTop: "1px solid #30363d", paddingTop: "12px", textAlign: "center" }}>
                  <p style={{ fontSize: "12px", color: "#8b949e", marginBottom: "8px" }}>
                  Record  Picture (Upload this manually):
                  </p>
                  <img
                    src={img.url}
                    alt="Student"
                    style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "2px solid #3b82f6" }}
                  />
                  <p style={{ fontSize: "11px", color: "#8b949e", marginTop: "4px" }}>
                    {img.fileName}
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="flex-row">
            <button onClick={handleFill} className="btn-primary">
              Fill Current Student
            </button>
            <button onClick={handleSubmitPage} className="btn-success">
              Submit Form on Page
            </button>
          </div>

          <div className="results">
            {fillResults.map((r, i) => (
              <div key={i} className={`r ${r.ok ? 'ok' : 'bad'}`}>
                <div>
                  {r.column}: {r.ok ? '✓ filled' : '✗ ' + r.reason}
                </div>

                {!r.ok && (
                  <>
                    <div className="flex-row" style={{ marginTop: '8px' }}>
                      <input
                        type="text"
                        placeholder="Fix value..."
                        defaultValue={students.rows[currentIndex][r.column] || ""}
                        id={`edit-${i}`}
                        className="edit-input"
                      />
                      <button onClick={() => {
                        const val = document.getElementById(`edit-${i}`).value;
                        handleUpdateField(i, val);
                      }}>
                        Update
                      </button>
                    </div>

                    {editErrors[i] && (
                      <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px', fontWeight: 'bold' }}>
                        ⚠ {editErrors[i]}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {batchActive && (
            <div className="card batch-card">
              <div style={{ marginBottom: "8px", fontWeight: "bold", color: "#fff" }}>
                Batch Active: Student {batchIndex + 1} of {students.rows.length}
              </div>
              <div className="flex-row">
                <button onClick={nextBatch} className="btn-success">
                  Confirm Review → Next Student
                </button>
                <button onClick={() => setBatchActive(false)} className="btn-danger">
                  Stop Batch
                </button>
              </div>
            </div>
          )}

          {!batchActive && (
            <button onClick={startBatch} style={{ width: "100%", marginTop: "20px" }}>
              Start Batch from Current Student
            </button>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === "settings" && (
        <div className="tab-panel">
          <p>Data is stored locally.</p>
          <button onClick={() => setShowDeleteModal(true)} className="btn-danger">
            Clear All Data
          </button>
          {statusMsg && <p style={{ color: "#10b981", marginTop: "10px" }}>{statusMsg}</p>}
        </div>
      )}

      {/* CUSTOM DELETE MODAL */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Are you sure?</h3>
            <p style={{ color: '#8b949e', fontSize: '13px', marginBottom: '15px' }}>
              This will permanently delete all imported students and saved mappings from your browser.
            </p>
            <div className="flex-row" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteModal(false)} className="btn-secondary" style={{ background: '#30363d', color: '#fff' }}>
                Cancel
              </button>
              <button onClick={async () => {
                await window.StorageMgr.clearAll();
                setStudents({ headers: [], rows: [], fileName: "" });
                setStudentImages({});
                setCurrentIndex(0);
                setSite({ hostname: "", fields: [], suggestions: [] });
                setShowDeleteModal(false);
                setStatusMsg("All data cleared successfully.");
              }} className="btn-danger">
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM SUBMIT MODAL */}
      {showSubmitModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Submit Form?</h3>
            <p style={{ color: '#8b949e', fontSize: '13px', marginBottom: '15px' }}>
              Are you sure you want to click the submit button on the page? Please review the form first.
            </p>
            <div className="flex-row" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSubmitModal(false)} className="btn-secondary" style={{ background: '#30363d', color: '#fff' }}>
                Cancel
              </button>
              <button onClick={async () => {
                setShowSubmitModal(false);
                try {
                  const res = await sendToActiveTab("SUBMIT_PAGE");
                  if (res.ok === false) throw new Error(res.error);
                  setFillResults([{ column: "Submit", ok: true, reason: "Form Submitted! Page is reloading..." }]);
                } catch (err) {
                  setFillResults([{ column: "Submit", ok: false, reason: err.message }]);
                }
              }} className="btn-success">
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}