"use client";
import Header from "../components/Header";
import ContainerWeb from "../components/ContainerWeb";
import GridContainer from "../components/GridContainer";
import { useState } from "react";

export default function Page() {
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const handleInputChange = (event) => {
    setUrl(event.target.value);
  };

  const download = async () => {
    setIsDownloading(true); // Deshabilitar el botón de descarga
    setProgress(0); // Limpiar progreso
    setMessage(""); // Limpiar mensajes

    const eventSource = new EventSource(`/api/qobuz/track?trackId=${url}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.progress !== undefined) {
        setProgress(data.progress);
      }

      if (data.message) {
        setMessage(data.message);
      }

      if (data.progress === 100 || data.error) {
        eventSource.close();
        setIsDownloading(false); // Habilitar el botón de descarga al finalizar
      }
    };

    eventSource.onerror = (error) => {
      setMessage("Error downloading");
      eventSource.close();
      setIsDownloading(false); // Habilitar el botón de descarga en caso de error
    };
  };

  return (
    <>
      <Header title={"Qobuz Downloader"} />
      <ContainerWeb>
        <GridContainer>
          <input
            id="link_qobuz"
            name="link_qobuz"
            type="text"
            required
            onChange={handleInputChange}
            className="flex-grow rounded-md border-0 bg-white/10 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
            placeholder="Enter your Qobuz link"
            disabled={isDownloading}
          />
          <button
            onClick={download}
            className={`ml-2 flex-none rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isDownloading}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </button>
        </GridContainer>
        {progress > 0 && <p>Progress: {progress.toFixed(0)}%</p>}
        {message && <p>{message}</p>}
      </ContainerWeb>
    </>
  );
}
