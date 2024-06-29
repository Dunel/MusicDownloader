"use client";
import { useState } from "react";
import Header from "../components/Header";
import ContainerWeb from "../components/ContainerWeb";
import GridContainer from "../components/GridContainer";

export default function Page() {
  const [url, setUrl] = useState("");
  const [coverDownload, setCoverDownload] = useState(false);
  const [lyricDownload, setLyricDownload] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const handleInputChange = (event) => {
    setUrl(event.target.value);
  };

  const download = async () => {
    setIsDownloading(true);
    setProgress(0);
    setMessage("");

    const eventSource = new EventSource(`/api/tidal?url=${url}&covers=${coverDownload}&lyrics=${lyricDownload}`);

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
        setIsDownloading(false);
      }
    };

    eventSource.onerror = () => {
      setMessage("Error downloading. Please check the URL and try again.");
      eventSource.close();
      setIsDownloading(false);
    };
  };

  return (
    <>
      <Header title={"Tidal Downloader"} />
      <ContainerWeb>
        <GridContainer>
          <img src="./tidal.png" alt="Tidal" width={200} height={200} />
          <div className="w-full flex flex-col md:flex-row items-center gap-4">
            <input
              id="link_tidal"
              name="link_tidal"
              type="text"
              required
              onChange={handleInputChange}
              className="flex-grow rounded-md border-0 bg-white/10 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
              placeholder="Enter your Tidal link"
              disabled={isDownloading}
            />
            <button
              onClick={download}
              className={`ml-2 flex-none rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                isDownloading ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={isDownloading}
            >
              {isDownloading ? "Downloading..." : "Download"}
            </button>
          </div>
          <div className="flex mt-4">
            <div className="flex h-6 items-center">
              <input
                id="comments"
                name="comments"
                type="checkbox"
                onChange={(e) => {
                  coverDownload
                    ? setCoverDownload(false)
                    : setCoverDownload(true);
                }}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
              />
            </div>
            <div className="text-sm ml-4 leading-6">
              <label htmlFor="comments" className="font-medium text-white">
                Download covers?
              </label>
              <p className="text-gray-400">
                download album covers in the same folder as the song files.
              </p>
            </div>

            <div className="flex h-6 items-center">
              <input
                id="lyrics"
                name="lyrics"
                type="checkbox"
                onChange={(e) => {
                  lyricDownload
                    ? setLyricDownload(false)
                    : setLyricDownload(true);
                }}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
              />
            </div>
            <div className="text-sm ml-4 leading-6">
              <label htmlFor="comments" className="font-medium text-white">
                Download lyrics?
              </label>
              <p className="text-gray-400">
                download the lyrics of the songs in the same folder as the song
                files.
              </p>
            </div>
          </div>
          <div className="text-sm ml-4 leading-6">
            {progress > 0 && <p>Progress: {progress.toFixed(0)}%</p>}
            {message && <p>{message}</p>}
          </div>
        </GridContainer>
      </ContainerWeb>
    </>
  );
}
