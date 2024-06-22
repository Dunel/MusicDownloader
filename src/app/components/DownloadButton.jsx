"use client";
import { useState } from "react";

const DownloadButton = ({ trackId }) => {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const downloadTrack = async () => {
    const eventSource = new EventSource(`/api/qobuz/track?trackId=${trackId}`);

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
      }
    };

    eventSource.onerror = (error) => {
      setMessage("Error downloading track");
      eventSource.close();
    };
  };

  return (
    <>
      <button
        type="submit"
        className="flex-none rounded-md bg-indigo-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        onClick={downloadTrack}
      >
        Download Track
      </button>
    </>
  );
};

export default DownloadButton;
