import { useState } from "react";
import FileUpload from "./components/FileUpload";
import Result from "./components/Result";

type Status = "ready" | "processing" | "done" | "error";
const PROCESS_ENDPOINT = import.meta.env.VITE_PROCESS_ENDPOINT ?? "/api/process";

interface ProcessResult {
  json: unknown;
}

function App() {
  const [amazonB2B, setAmazonB2B] = useState<File | null>(null);
  const [amazonB2C, setAmazonB2C] = useState<File | null>(null);
  const [flipkart, setFlipkart] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<ProcessResult | null>(null);

  const isLoading = status === "processing";
  const isReadyToProcess = amazonB2B && amazonB2C && flipkart;

  async function handleProcess(): Promise<void> {
    if (!isReadyToProcess || isLoading) {
      return;
    }

    setStatus("processing");
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("amazonB2B", amazonB2B);
      formData.append("amazonB2C", amazonB2C);
      formData.append("flipkart", flipkart);

      const response = await fetch(PROCESS_ENDPOINT, {
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
          <h1>Build the monthly GSTR-1 from marketplace exports</h1>
          <p className="lede">
            Upload Amazon B2B, Amazon B2C, and Flipkart monthly reports together to
            generate the consolidated GST JSON.
          </p>
        </div>

        <div className="upload-stack">
          <FileUpload
            id="amazon-b2b"
            label="Amazon B2B CSV"
            hint="Upload the monthly Amazon MTR_B2B CSV"
            file={amazonB2B}
            onFileSelect={setAmazonB2B}
            disabled={isLoading}
          />
          <FileUpload
            id="amazon-b2c"
            label="Amazon B2C CSV"
            hint="Upload the monthly Amazon MTR_B2C CSV"
            file={amazonB2C}
            onFileSelect={setAmazonB2C}
            disabled={isLoading}
          />
          <FileUpload
            id="flipkart"
            label="Flipkart XLSX"
            hint="Upload the monthly Flipkart workbook"
            file={flipkart}
            onFileSelect={setFlipkart}
            disabled={isLoading}
          />
        </div>

        <div className="actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleProcess}
            disabled={!isReadyToProcess || isLoading}
          >
            {isLoading ? "Processing..." : "Process Files"}
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
