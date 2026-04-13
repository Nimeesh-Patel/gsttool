interface FileUploadProps {
  file: File | null;
  disabled?: boolean;
  onFileSelect: (file: File | null) => void;
}

function FileUpload({ file, disabled = false, onFileSelect }: FileUploadProps) {
  return (
    <div className="upload-card">
      <label className="upload-label" htmlFor="report-file">
        Upload Amazon / Flipkart file
      </label>
      <input
        id="report-file"
        className="file-input"
        type="file"
        accept=".csv,.xlsx"
        disabled={disabled}
        onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
      />
      <p className="file-hint">{file ? file.name : "CSV or XLSX"}</p>
    </div>
  );
}

export default FileUpload;
