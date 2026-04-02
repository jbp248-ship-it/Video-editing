"use client";
import { useState, useRef, DragEvent } from "react";

const SAMPLE_CSV = `Event Name, Date, Venue, Section, Row, Seat From, Seat To, Quantity, Purchase Price, Platform, Status
Taylor Swift, 2025-08-15, SoFi Stadium, 234, A, 1, 4, 4, 125.00, STUBHUB, IN_HAND
Bad Bunny, 2025-09-20, Madison Square Garden, 101, B, 5, 8, 4, 89.50, SEATGEEK, LISTED`;

export function CSVImport() {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          setCsv(text ?? "");
          setPreview(null);
          setResult(null);
        } catch (err) {
          console.error("[CSVImport] Failed to read file content:", err);
          setResult({ created: 0, errors: ["Failed to read the file content."] });
        }
      };
      reader.onerror = () => {
        console.error("[CSVImport] FileReader error");
        setResult({ created: 0, errors: ["Failed to read the file. Please try again."] });
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("[CSVImport] FileReader init error:", err);
      setResult({ created: 0, errors: ["Failed to initialize file reader."] });
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    try {
      const file = e.dataTransfer?.files?.[0];
      if (file && file.name.endsWith(".csv")) {
        handleFile(file);
      }
    } catch (err) {
      console.error("[CSVImport] Drop handler error:", err);
      setResult({ created: 0, errors: ["Failed to process dropped file."] });
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handlePreview = () => {
    if (!csv.trim()) return;
    try {
      const lines = csv.trim().split("\n").map(l => l.trim()).filter(l => l);
      const rows = lines.map(l => l.split(",").map(c => c.trim()));
      setPreview(rows);
      setResult(null);
    } catch (err) {
      console.error("[CSVImport] Preview parse error:", err);
      setResult({ created: 0, errors: ["Failed to parse CSV for preview."] });
    }
  };

  const handleImport = async () => {
    if (!csv.trim()) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      setResult(data);
      if (data.created > 0) {
        setPreview(null);
      }
    } catch {
      setResult({ created: 0, errors: ["Network error — could not reach server."] });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ticket-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-label">CSV Import</h3>
        <button onClick={downloadTemplate} className="btn-ghost text-xs py-1 px-2">
          Download Template
        </button>
      </div>

      {/* Drop zone + textarea */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: dragging ? "2px dashed #D97706" : "2px dashed #C4BBB0",
          borderRadius: "8px",
          backgroundColor: dragging ? "rgba(217,119,6,0.05)" : "transparent",
          transition: "all 150ms ease",
        }}
      >
        <textarea
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setPreview(null);
            setResult(null);
          }}
          placeholder="Paste CSV data here, or drag &amp; drop a .csv file..."
          rows={8}
          style={{
            width: "100%",
            padding: "12px",
            border: "none",
            background: "transparent",
            fontFamily: "monospace",
            fontSize: "13px",
            color: "#44403C",
            resize: "vertical",
            outline: "none",
          }}
        />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="btn-ghost text-sm py-1.5 px-3"
        >
          Browse File
        </button>
        <button
          onClick={handlePreview}
          disabled={!csv.trim()}
          className="btn-ghost text-sm py-1.5 px-3"
          style={{ opacity: csv.trim() ? 1 : 0.4 }}
        >
          Preview
        </button>
        <button
          onClick={handleImport}
          disabled={!csv.trim() || importing}
          style={{
            padding: "6px 16px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 600,
            color: "#fff",
            backgroundColor: importing ? "#A89F91" : "#D97706",
            border: "none",
            cursor: !csv.trim() || importing ? "not-allowed" : "pointer",
            opacity: csv.trim() ? 1 : 0.4,
            transition: "all 150ms ease",
          }}
        >
          {importing ? "Importing..." : "Import"}
        </button>
      </div>

      {/* Result feedback */}
      {result && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            backgroundColor: result.created > 0 ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
            borderLeft: `3px solid ${result.created > 0 ? "#16a34a" : "#dc2626"}`,
          }}
        >
          {result.created > 0 && (
            <p style={{ color: "#16a34a", fontWeight: 600, fontSize: "14px" }}>
              Successfully imported {result.created} ticket{result.created !== 1 ? "s" : ""}.
            </p>
          )}
          {result.errors && result.errors.length > 0 && (
            <div style={{ marginTop: result.created > 0 ? "8px" : 0 }}>
              <p style={{ color: "#dc2626", fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>
                {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}:
              </p>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#78716C" }}>
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Preview table */}
      {preview && preview.length > 1 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                {preview[0].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderBottom: "2px solid #E7E0D8",
                      color: "#78716C",
                      fontWeight: 600,
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.slice(1).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: "6px 10px",
                        borderBottom: "1px solid #F0EBE4",
                        color: "#44403C",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: "12px", color: "#A89F91", marginTop: "8px" }}>
            {preview.length - 1} row{preview.length - 1 !== 1 ? "s" : ""} detected
          </p>
        </div>
      )}
    </div>
  );
}
