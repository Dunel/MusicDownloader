import axios from "axios";
import { TIDAL_AUTH_BASE, TIDAL_API_BASE } from "./constants.js";
import {
  Contributor,
  RawAlbum,
  RawArtist,
  RawTrack,
  addCredits,
  parseAlbum,
  parseArtist,
  parseMpd,
  parseTrack,
} from "./parse.js";
import Stream from "stream";
import fs from "fs-extra";
import path, { resolve } from "path";
import tagFile from "./tagging.js";

class Tidal {
  constructor(config) {
    const getFileTokens = () => {
      try {
        const data = fs.readFileSync(
          resolve("./src/services/tidal/tokens.json"),
          "utf8"
        );
        const jsonData = JSON.parse(data);
        return jsonData;
      } catch (error) {
        console.error("Error al leer o parsear el archivo:", error);
        throw error;
      }
    };

    const tokens = getFileTokens();
    this.tvToken = tokens.tvToken;
    this.tvSecret = tokens.tvSecret;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.expires = tokens.expires;
    this.coversDownload = config.coversDownload || false;
    this.lyricsDownload = config.lyricsDownload || false;
    this.hostnames = ["tidal.com", "www.tidal.com", "listen.tidal.com"];
    this.failedAuth = false;
    this.tokensPath = resolve("./src/services/tidal/tokens.json");
    this.localPath = resolve("./downloads/tidal/");

    this.tokensUpdated = false;

    const getReady = async () => {
      try {
        if (!this.refreshToken) return;
        if (await this.sessionValid()) return;
        const success = await this.refresh();
        if (!success)
          console.log(
            `[tidal] Failed to refresh tokens, this could be a bad sign`
          );
      } catch (error) {
        console.error("getready fail");
      }
    };
    getReady();
  }

  headers() {
    return {
      "X-Tidal-Token": this.tvToken,
      Authorization: `Bearer ${this.accessToken}`,
      "Accept-Encoding": "gzip",
      "User-Agent": "TIDAL_ANDROID/1039 okhttp/3.14.9",
    };
  }

  async #get(url, params = {}) {
    if (Date.now() > this.expires) await this.refresh();
    if (this.failedAuth)
      throw new Error(`Last request failed to authorize, get new tokens`);

    params.countryCode = params.countryCode ?? "US";
    params.locale = params.locale ?? "en_US";
    params.deviceType = params.deviceType ?? "TV";

    const response = await axios.get(`${TIDAL_API_BASE}${url}`, {
      headers: this.headers(),
      params: params,
    });

    if (response.status !== 200) {
      const errMsg = response.data;
      const sessionValid = await this.sessionValid();
      if (response.status == 401 && !sessionValid) {
        this.failedAuth = !(await this.refresh());
        console.log("[tidal] Refreshed tokens");
        if (this.failedAuth) {
          throw new Error("Auth failed. Try getting new tokens.");
        }
        return this.#get(url, params);
      }
      console.error("[tidal] Tidal error response:", errMsg);
      throw new Error(
        `Fetching ${url} from Tidal failed with status code ${response.status}.`
      );
    }
    return response.data;
  }

  async sessionValid() {
    try {
      const resp = await axios.get("https://api.tidal.com/v1/sessions", {
        headers: this.headers(),
      });
      return resp.status === 200;
    } catch (error) {
      console.error("sessionValid fail");
      return false;
    }
  }

  async fileToken(newAccessToken, newRefreshToken, newExpires) {
    fs.readFile(this.tokensPath, "utf8", (err, data) => {
      if (err) {
        console.error("Error al leer el archivo:", err);
        return;
      }

      let jsonData;
      try {
        jsonData = JSON.parse(data);
      } catch (parseErr) {
        console.error("Error al parsear JSON:", parseErr);
        return;
      }

      jsonData.accessToken = newAccessToken;
      jsonData.refreshToken = newRefreshToken;
      jsonData.expires = newExpires;

      const newJsonData = JSON.stringify(jsonData, null, 2);

      fs.writeFile(this.tokensPath, newJsonData, "utf8", (writeErr) => {
        if (writeErr) {
          console.error("Error al escribir el archivo:", writeErr);
          return "Error actualizando tokens";
        } else {
          console.log("Archivo JSON actualizado correctamente.");
          return "tokens actualizado correctamente";
        }
      });
    });
  }

  async getTokens() {
    try {
      const deviceAuthResponse = await axios.post(
        `${TIDAL_AUTH_BASE}oauth2/device_authorization`,
        new URLSearchParams({
          client_id: this.tvToken,
          scope: "r_usr w_usr",
        })
      );

      if (deviceAuthResponse.status != 200)
        throw new Error(`Couldn't authorize Tidal`);

      const deviceAuth = deviceAuthResponse.data;
      const linkUrl = `https://link.tidal.com/${deviceAuth.userCode}`;

      const checkToken = async () => {
        try {
          const params = {
            client_id: this.tvToken,
            client_secret: this.tvSecret,
            device_code: deviceAuth.deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            scope: "r_usr w_usr",
          };

          let statusCode = 400;
          while (statusCode === 400) {
            await new Promise((r) => setTimeout(r, 30000)); // 30 segundos de espera
            const loginResponse = await axios.post(
              `${TIDAL_AUTH_BASE}oauth2/token`,
              new URLSearchParams(params)
            );
            statusCode = loginResponse.status;
            if (statusCode === 200) {
              const loginData = loginResponse.data;
              this.accessToken = loginData.access_token;
              this.refreshToken = loginData.refresh_token;
              this.expires = Date.now() + loginData.expires_in * 1000;
              this.tokensUpdated = true;
              console.log(
                "[tidal] Using the following new config:",
                this.getCurrentConfig()
              );
              this.fileToken(
                loginData.access_token,
                loginData.refresh_token,
                Date.now() + loginData.expires_in * 1000
              );
              return loginData;
            }
          }
        } catch (error) {
          console.log(error.response.data);
        }
      };

      console.log(`[tidal] Log in at ${linkUrl}`);
      checkToken();
      return linkUrl;
    } catch (error) {
      console.error("getTokens failed:", error.response.data);
    }
  }

  getCurrentConfig() {
    return {
      tvToken: this.tvToken,
      tvSecret: this.tvSecret,
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expires: this.expires,
    };
  }

  async refresh() {
    try {
      const refreshResponse = await axios.post(
        `${TIDAL_AUTH_BASE}oauth2/token`,
        new URLSearchParams({
          refresh_token: this.refreshToken,
          client_id: this.tvToken,
          client_secret: this.tvSecret,
          grant_type: "refresh_token",
        })
      );

      if (refreshResponse.status == 200) {
        const refreshData = refreshResponse.data;
        this.expires = Date.now() + refreshData.expires_in * 1000;
        this.accessToken = refreshData.access_token;
        if (refreshData.refresh_token)
          this.refreshToken = refreshData.refresh_token;
        return true;
      }
      return false;
    } catch (error) {
      console.error("refresh fail");
      return false;
    }
  }

  async search(query, limit = 20) {
    const results = await this.#get("search/top-hits", {
      query: query,
      limit: limit,
      offset: 0,
      types: "ARTISTS,ALBUMS,TRACKS",
      includeContributors: "true",
      includeUserPlaylists: "true",
      supportsUserData: "true",
    });

    return {
      query,
      albums: results.albums.items.map(parseAlbum),
      artists: results.artists.items.map(parseArtist),
      tracks: results.tracks.items.map(parseTrack),
    };
  }

  async #getTrack(trackId) {
    try {
      const trackResponse = await this.#get(`tracks/${trackId}`);
      const contributorResponse = (
        await this.#get(`tracks/${trackId}/contributors`)
      ).items;
      trackResponse.album = await this.#get(`albums/${trackResponse.album.id}`);
      return parseTrack(addCredits(trackResponse, contributorResponse));
    } catch (error) {
      console.error(error.response.data);
      return error.response.data;
    }
  }

  async #getAlbum(albumId) {
    const albumResponse = await this.#get(`albums/${albumId}`);
    return parseAlbum(albumResponse);
  }

  async #getAlbumTracks(albumId) {
    const contributorResponse = await this.#get(
      `albums/${albumId}/items/credits`,
      {
        replace: "true",
        offset: 0,
        includeContributors: "true",
        limit: 100,
      }
    );
    return contributorResponse.items.map((item) =>
      parseTrack(addCredits(item.item, item.credits))
    );
  }

  async #getArtist(artistId) {
    const [artistResponse, albumsResponse, tracksResponse] = await Promise.all([
      this.#get(`artists/${artistId}`),
      this.#get(`artists/${artistId}/albums`, { limit: 20 }),
      this.#get(`artists/${artistId}/toptracks`, { limit: 20 }),
    ]);
    return {
      ...parseArtist(artistResponse),
      albums: albumsResponse.items.map(parseAlbum),
      tracks: tracksResponse.items.map(parseTrack),
    };
  }

  async getTestTrack(artistId) {
    try {
      const trackInfo = await this.#getTrack(346800957);
      return trackInfo;
    } catch (error) {
      return error.message;
    }
  }

  async #getFileUrl(trackId, quality = "LOSSLESS") {
    try {
      const playbackInfoResponse = await this.#get(
        `tracks/${trackId}/playbackinfopostpaywall/v4`,
        {
          playbackmode: "STREAM",
          assetpresentation: "FULL",
          audioquality: quality,
          prefetch: "false",
        }
      );
      //console.log(playbackInfoResponse);

      if (
        playbackInfoResponse.audioQuality == "HIGH" ||
        playbackInfoResponse.audioQuality == "LOW"
      )
        throw new Error(
          "This ripper is incompatible with AAC codecs formats at the moment."
        );

      const manifestStr = Buffer.from(
        playbackInfoResponse.manifest,
        "base64"
      ).toString("utf-8");

      if (playbackInfoResponse.manifestMimeType != "application/dash+xml") {
        const manifest = JSON.parse(manifestStr);
        const streamResponse = await axios.get(manifest.urls[0], {
          responseType: "stream",
        });
        return {
          mimeType: manifest.mimeType,
          sizeBytes: parseInt(streamResponse.headers["content-length"]),
          stream: streamResponse.data,
        };
      }

      const trackUrls = parseMpd(manifestStr);

      const ffmpegProc = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "-",
        "-c:a",
        "copy",
        "-f",
        "flac",
        "-",
      ]);

      const stream = new Stream.Readable({
        read() {},
      });

      async function load() {
        for (const url of trackUrls) {
          const resp = await axios.get(url, { responseType: "stream" });
          if (!resp.data) throw new Error("Response has no body");
          for await (const chunk of resp.data) {
            stream.push(chunk);
          }
        }
        stream.push(null);
      }

      stream.pipe(ffmpegProc.stdin);
      ffmpegProc.stderr.pipe(process.stderr);
      load();

      return {
        mimeType: "audio/flac",
        stream: ffmpegProc.stdout,
      };
    } catch (error) {
      console.error("getFileUrl failed:", error);
    }
  }

  async #getLyric(track_id) {
    try {
      const dataLyric = await this.#get(`tracks/${track_id}/lyrics`);
      return dataLyric.subtitles;
    } catch (error) {
      return false;
    }
  }

  async downloadTrack(trackInfo, basePath) {
    try {
      //console.log(trackInfo)
      const track_name = `${trackInfo.title} - ${trackInfo.artists[0].name}`;
      const tempPath = path.join(
        basePath,
        `${this.sanitizeFilename(track_name)}.flac`
      );
      if (fs.existsSync(tempPath)) {
        console.log(`The file ${tempPath} already exists`);
        return tempPath;
      }

      if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
      }

      const { stream } = await this.#getFileUrl(trackInfo.id, trackInfo.audioQuality);
      const writeStream = fs.createWriteStream(tempPath);

      return new Promise((resolve, reject) => {4504807
        stream.pipe(writeStream);
        stream.on("end", async () => {
          try {
            await tagFile(trackInfo, tempPath);
            if (this.lyricsDownload) {
              await this.saveLrc(tempPath, trackInfo.id);
            }
            resolve(tempPath);
          } catch (tagError) {
            reject(tagError);
          }
        });
        stream.on("error", reject);
      });
    } catch (error) {
      console.error("downloadTrack failed:", error);
    }
  }

  getLrcPath(finalPath) {
    return finalPath.replace(/\.\w+$/, ".lrc");
  }

  async saveLrc(lrcPath, trackId) {
    const lyricData = await this.#getLyric(trackId);
    if (!lyricData) return;

    const lrcPathFinal = this.getLrcPath(lrcPath);
    fs.writeFileSync(lrcPathFinal, lyricData, "utf8");
  }

  async getAlbumDownloadV2(albumInfo, progressCallback, artist = false) {
    try {
      const album_data = albumInfo.albumdata;
      const trackArray = albumInfo.tracks;
      const totalTracks = trackArray.length;
      //console.log("album: " + album_data)
      let completedTracks = 0;
      let progressMap = new Map();

      const sanitizedAlbumName = `${
        album_data.artists[0].name
      }/${this.sanitizeFilename(album_data.title)}`;
      const downloadsPath = path.resolve(this.localPath, sanitizedAlbumName);

      if (!fs.existsSync(downloadsPath)) {
        fs.mkdirSync(downloadsPath, { recursive: true });
      }

      //await this.getAlbumInfoFile(album_data, downloadsPath);

      const concurrentDownloads = 4;
      const downloadQueue = [];

      const updateProgress = (message) => {
        let totalProgress = 0;
        for (const progress of progressMap.values()) {
          totalProgress += progress;
        }
        const overallProgress = totalProgress / totalTracks;
        progressCallback(artist ? artist : overallProgress - 1, message);
      };

      const startDownload = async (track, trackIndex) => {
        try {
          const trackInfoId = await this.#getTrack(track.id);
          //console.log(trackInfoId)
          await this.downloadTrack(
            trackInfoId,
            /*(trackProgress, message) => {
              progressMap.set(trackIndex, trackProgress);
              updateProgress(message);
            },*/
            downloadsPath
          );
          completedTracks++;
          progressMap.set(trackIndex, 100);
          updateProgress(`Completed tracks: ${completedTracks}/${totalTracks}`);
        } catch (error) {
          console.error(`Error downloading track ${trackIndex}:`, error);
        } finally {
          if (downloadQueue.length > 0) {
            const nextTrack = downloadQueue.shift();
            startDownload(nextTrack.track, nextTrack.index);
          }
        }
      };

      for (let i = 0; i < trackArray.length; i++) {
        if (i < concurrentDownloads) {
          startDownload(trackArray[i], i);
        } else {
          downloadQueue.push({ track: trackArray[i], index: i });
        }
      }

      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (completedTracks === totalTracks) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });

      if (!this.coversDownload) {
        const coverpath = this.imagePath(downloadsPath, album_data.title);
        await this.cleanupTempPath(coverpath);
      }

      progressCallback(
        artist ? artist : 100,
        `${this.sanitizeFilename(album_data.title)} Album download complete.`
      );
      return "Album download complete.";
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  imagePath(trackPath, name) {
    const imageName = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_cover.jpg`;
    //console.log(name);
    const finalPath = path.join(trackPath, imageName);
    return finalPath;
  }

  async cleanupTempPath(removePath) {
    if (fs.existsSync(removePath)) {
      console.log("Removing temporary");
      await fs.unlink(removePath);
    }
  }

  async getArtistAlbums(artisId, progressCallback) {
    try {
      const artist = await this.#getArtist(artisId);
      progressCallback(
        1,
        `Downloading albums by the artist ${this.sanitizeFilename(
          artist.name
        )}.`
      );

      const progress = 100 / artist.albums.length;
      let countprogress = 0;
      for (const album of artist.albums) {
        countprogress = countprogress + progress;
        progressCallback(
          countprogress - 1,
          `Downloading album ${this.sanitizeFilename(album.title)}...`
        );

        const tracks = await this.#getAlbumTracks(album.id);
        const albumdata = await this.#getAlbum(album.id);
        await this.getAlbumDownloadV2(
          { tracks, albumdata },
          progressCallback,
          countprogress - 1
        );
      }
      progressCallback(
        100,
        `${this.sanitizeFilename(artist.name)} Albums download complete.`
      );
      return;
    } catch (error) {
      return error;
    }
  }

  async getSingleTrack(id, progressCallback) {
    const trackdata = await this.#getTrack(id);
    const basePath = resolve(
      this.localPath,
      `${this.sanitizeFilename(
        trackdata.artists[0].name
      )}/${this.sanitizeFilename(trackdata.title)}`
    );
    progressCallback(
      1,
      `Downloading ${trackdata.title} - ${trackdata.artists[0].name}.flac`
    );
    await this.downloadTrack(trackdata, basePath);

    if (!this.coversDownload) {
      const coverpath = this.imagePath(basePath, trackdata.album.title);
      await this.cleanupTempPath(coverpath);
    }
    progressCallback(
      100,
      `Track ${trackdata.title} - ${trackdata.artists[0].name}.flac download complete`
    );
    return;
  }

  #getUrlParts(url) {
    const urlParts = url
      .match(
        /^https?:\/\/(?:www\.|listen\.)?tidal\.com\/(?:browse\/)?(.*?)\/(.*?)\/?$/
      )
      ?.slice(1, 3);
    if (!urlParts)
      throw new Error("URL not supported. Please enter a valid Tidal URL.");
    urlParts[1] = urlParts[1].replace(/\?.*?$/, "");
    if (
      urlParts[0] !== "artist" &&
      urlParts[0] !== "album" &&
      urlParts[0] !== "track"
    ) {
      throw new Error(
        "URL unrecognized. Please enter a URL for an artist, album, or track."
      );
    }
    return [urlParts[0], urlParts[1]];
  }

  getTypeFromUrl(url) {
    return this.#getUrlParts(url)[0];
  }

  async getByUrl(url, progressCallback) {
    const [type, id] = this.#getUrlParts(url);
    switch (type) {
      case "track":
        return await this.getSingleTrack(id, progressCallback);
      case "album":
        const tracks = await this.#getAlbumTracks(id);
        const albumdata = await this.#getAlbum(id);
        return this.getAlbumDownloadV2({ tracks, albumdata }, progressCallback);
      case "artist":
        return await this.getArtistAlbums(id, progressCallback);
      default:
        throw new Error("Invalid URL type");
    }
  }

  sanitizeFilename(name) {
    return name
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
}

export default Tidal;
