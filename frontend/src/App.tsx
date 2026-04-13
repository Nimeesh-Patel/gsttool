import { useState } from "react";
import FileUpload from "./components/FileUpload";
import Result from "./components/Result";

type Status = "ready" | "processing" | "done" | "error";

interface ProcessResult {
  json: unknown;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<ProcessResult | null>(null);

  const isLoading = status === "processing";

  async function handleProcess(): Promise<void> {
    if (!file || isLoading) {
      return;
    }

    setStatus("processing");
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/process", {
        method: "POST",
        body: formData
      });

      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json")
        ? ((await response.json()) as unknown)
        : await response.text();

      if (!response.ok) {
        const message =
          typeof body === "string"
            ? body
            : "message" in (body as Record<string, unknown>)
              ? String((body as Record<string, unknown>).message)
              : "Processing failed.";

        throw new Error(message);
      }

      setResult({ json: body });
      setStatus("done");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Something went wrong.";
      setError(message);
      setStatus("error");
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="panel-copy">
          <p className="eyebrow">GST Tool</p>
          <h1>Convert marketplace reports into GSTR-1 JSON</h1>
          <p className="lede">
            Upload an Amazon or Flipkart export, process it, and download the generated
            JSON.
          </p>
        </div>

        <FileUpload file={file} onFileSelect={setFile} disabled={isLoading} />

        <div className="actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleProcess}
            disabled={!file || isLoading}
          >
            {isLoading ? "Processing..." : "Process File"}
          </button>
          <p className="status">
            Status:{" "}
            <span className={`status-badge status-${status}`}>
              {status === "ready" && "Ready"}
              {status === "processing" && "Processing"}
              {status === "done" && "Done"}
              {status === "error" && "Error"}
            </span>
          </p>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        <Result result={result} isVisible={status === "done" && result !== null} />
      </section>
    </main>
  );
}

export default App;
