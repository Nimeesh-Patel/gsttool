interface FileUploadProps {
  file: File | null;
  id: string;
  label: string;
  hint: string;
  disabled?: boolean;
  onFileSelect: (file: File | null) => void;
}

function FileUpload({
  file,
  id,
  label,
  hint,
  disabled = false,
  onFileSelect
}: FileUploadProps) {
  return (
    <div className="upload-card">
      <label className="upload-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="file-input"
        type="file"
        accept=".csv,.xlsx"
        disabled={disabled}
        onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
      />
      <p className="file-hint">{file ? file.name : hint}</p>
    </div>
  );
}

export default FileUpload;
