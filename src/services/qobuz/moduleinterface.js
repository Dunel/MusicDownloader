import Qobuz from "./qobuz";
import fs from "fs-extra";
import path, { resolve } from "path";
import axios from "axios";
import { Tags, TrackInfo } from "../utils/models";
import tagFile from "./tagging";

class ModuleInterface {
  constructor(config) {
    this.qobuz = new Qobuz();
    this.login();
    this.covers = config ? config.covers : false;
    this.localpath = resolve("./downloads/qobuz");
    this.localTempPath = resolve("./downloads/qobuz/temp");
  }

  async login() {
    try {
      const email = process.env.QOBUZ_USERNAME;
      const password = process.env.QOBUZ_PASSWORD;
      await this.qobuz.login(email, password);
    } catch (error) {
      console.error("Error in login:", error.message);
      console.error("Stack:", error.stack);
      throw error;
    }
  }

  async getTrackInfoV2(track_id, data = {}) {
    try {
      const track_data = data[track_id]
        ? data[track_id]
        : await this.qobuz.getTrack(track_id);
      const album_data = track_data.album;
      const main_artist = track_data.performer
        ? track_data.performer
        : album_data.artist;
      const artists = [
        main_artist.name.normalize("NFKD").replace(/[^\x00-\x7F]/g, ""),
      ];

      if (track_data.performers) {
        let performers = [];
        track_data.performers.split(" - ").forEach((credit) => {
          let contributor_role = credit.split(", ").slice(1);
          let contributor_name = credit.split(", ")[0];

          ["MainArtist", "FeaturedArtist", "Artist"].forEach((contributor) => {
            if (contributor_role.includes(contributor)) {
              if (!artists.includes(contributor_name)) {
                artists.push(contributor_name);
              }
              contributor_role = contributor_role.filter(
                (role) => role !== contributor
              );
            }
          });

          if (contributor_role.length > 0) {
            performers.push(
              `${contributor_name}, ${contributor_role.join(", ")}`
            );
          }
        });
        track_data.performers = performers.join(" - ");
      }
      artists[0] = main_artist.name;

      const tagData = {
        album_artist: album_data.artist.name,
        composer: track_data.composer ? track_data.composer.name : null,
        release_date: album_data.release_date_original,
        track_number: track_data.track_number,
        total_tracks: album_data.tracks_count,
        disc_number: track_data.media_number,
        total_discs: album_data.media_count,
        isrc: track_data.isrc,
        upc: album_data.upc,
        label: album_data.label ? album_data.label.name : null,
        copyright: album_data.copyright,
        genres: [album_data.genre.name],
      };

      const tags = new Tags(tagData);

      const stream_data = await this.qobuz.getFileUrl(track_id);
      let bitrate = 320;
      if ([6, 7, 27].includes(stream_data.format_id)) {
        bitrate = Math.floor(
          (stream_data.sampling_rate * 1000 * stream_data.bit_depth * 2) / 1000
        );
      } else if (!stream_data.format_id) {
        bitrate = stream_data.format_id;
      }

      let track_name = track_data.work ? `${track_data.work} - ` : "";
      track_name += track_data.title.trim();
      if (track_data.version) {
        track_name += ` (${track_data.version})`;
      }

      let album_name = album_data.title.trim();
      if (album_data.version) {
        album_name += ` (${album_data.version})`;
      }

      const trackInfoData = {
        name: track_name,
        album: album_name,
        album_id: album_data.id,
        artists: artists,
        tags: tags,
        codec: [6, 7, 27].includes(stream_data.format_id)
          ? "FLAC"
          : stream_data.format_id
          ? "MP3"
          : "NONE",
        cover_url: album_data.image.large.split("_")[0] + "_org.jpg",
        release_year: parseInt(album_data.release_date_original.split("-")[0]),
        duration: track_data.duration,
        explicit: track_data.parental_warning,
        artist_id: main_artist.id,
        bit_depth: stream_data.bit_depth,
        sample_rate: stream_data.sampling_rate,
        bitrate: bitrate,
        download_extra_kwargs: { data: { [track_id]: track_data } },
        cover_extra_kwargs: { url: stream_data.url },
        error: !track_data.streamable
          ? `Track "${track_data.title}" is not streamable!`
          : null,
      };

      return new TrackInfo(trackInfoData);
    } catch (error) {
      //console.log("errorres: "+error);
      throw error;
    }
  }

  async getTrackDownload(
    trackId,
    basePath,
    music_name,
    progressCallback,
    retries = 3
  ) {
    try {
      if (!trackId) {
        throw new Error("trackId is required");
      }

      const downloadsPath = basePath;
      if (!fs.existsSync(downloadsPath)) {
        fs.mkdirSync(downloadsPath, { recursive: true });
      }

      const tempPath = path.join(
        downloadsPath,
        `${this.sanitizeFilename(music_name)}.flac`
      );
      if (fs.existsSync(tempPath)) {
        console.log(`The file ${tempPath} already exists`);
        return tempPath;
      }

      const trackData = await this.qobuz.getFileUrl(trackId);
      const trackUrl = trackData.url;

      const response = await axios({
        method: "GET",
        url: trackUrl,
        responseType: "stream",
      });

      const totalSize = parseInt(response.headers["content-length"], 10);
      let downloaded = 0;

      response.data.on("data", (chunk) => {
        downloaded += chunk.length;
        const progress = (downloaded / totalSize) * 100;
        if (progressCallback) {
          progressCallback(progress);
        }
      });

      const writer = fs.createWriteStream(tempPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      return tempPath;
    } catch (error) {
      if (error.code === "ECONNRESET" && retries > 0) {
        console.log(`Retrying download (${retries} attempts left)...`);
        return this.getTrackDownload(
          trackId,
          basePath,
          music_name,
          progressCallback,
          retries - 1
        );
      }
      console.error("Error downloading the file:", error);
      throw error;
    }
  }

  async getTrackInfoDownload(
    trackId,
    progressCallback,
    basePathCustom = this.localpath
  ) {
    try {
      const trackinfo = await this.getTrackInfoV2(trackId);
      const basePath = basePathCustom;
      const music_name = `${trackinfo.name} - ${trackinfo.artists[0]}`;
      console.log("Downloading: " + music_name);

      const tempPath = path.join(
        basePath,
        `${this.sanitizeFilename(music_name)}.flac`
      );
      if (fs.existsSync(tempPath)) {
        console.log(`The file ${tempPath} already exists`);
        progressCallback(100, `The file ${music_name}.flac already exists`);
        return `The file ${music_name}.flac already exists`;
      }

      const filePath = await this.getTrackDownload(
        trackId,
        basePath,
        music_name,
        progressCallback
      );

      if (!fs.existsSync(filePath)) {
        console.error("The file does not exist:", filePath);
        progressCallback(100, `The file ${music_name}.flac does not exist`);
        return;
      }

      progressCallback(100, `Adding tags to ${music_name}`);
      //const coverPath = this.imagePath(basePath, trackinfo.album)
      await tagFile(trackinfo, filePath);

      return `Download completed for ${music_name}`;
    } catch (error) {
      throw error;
    }
  }

  async getTrackInfoDownloadV2(
    trackId,
    updateProgress,
    basePathCustom = this.localpath,
    isAlbumDownload = false
  ) {
    try {
      const trackinfo = await this.getTrackInfoV2(trackId);
      const basePath = basePathCustom;
      const music_name = `${trackinfo.name} - ${trackinfo.artists[0]}`;
      updateProgress(
        isAlbumDownload ? isAlbumDownload : 0,
        `Downloading: ${music_name}`
      );

      const tempPath = path.join(
        basePath,
        `${this.sanitizeFilename(music_name)}.flac`
      );

      if (fs.existsSync(tempPath)) {
        updateProgress(
          isAlbumDownload ? isAlbumDownload : 99,
          `The file ${music_name}.flac already exists`
        );
        return `The file ${music_name}.flac already exists`;
      }

      const filePath = await this.getTrackDownload(
        trackId,
        basePath,
        music_name
      );

      if (!fs.existsSync(filePath)) {
        updateProgress(
          isAlbumDownload ? isAlbumDownload : 99,
          `The file ${music_name}.flac does not exist`
        );
        return;
      }

      updateProgress(
        isAlbumDownload ? isAlbumDownload : 50,
        `Adding metadata for ${music_name}`
      );
      const coverPath = this.imagePath(basePath, trackinfo.album);
      await tagFile(trackinfo, filePath, coverPath);

      if (!this.covers && !isAlbumDownload) {
        await this.cleanupTempPath(coverPath);
      }

      updateProgress(
        isAlbumDownload ? isAlbumDownload : 99,
        `Download completed for ${music_name}`
      );
      return `Download completed for ${music_name}`;
    } catch (error) {
      updateProgress(
        isAlbumDownload ? isAlbumDownload : 99,
        `Error: ${error.message}`
      );
      throw error;
    }
  }

  sanitizeFilename(name) {
    return name
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  async getPlayList(playlist_id) {
    const playlist_data = await this.qobuz.getPlaylist(playlist_id);

    let tracks = [];
    let extra_kwargs = {};
    playlist_data.tracks.items.forEach((track) => {
      const track_id = String(track.id);
      extra_kwargs[track_id] = track;
      tracks.push(track_id);
    });

    return {
      name: playlist_data.name,
      creator: playlist_data.owner.name,
      creator_id: playlist_data.owner.id,
      release_year: new Date(playlist_data.created_at * 1000).getUTCFullYear(),
      description: playlist_data.description,
      duration: playlist_data.duration,
      tracks,
      track_extra_kwargs: { data: extra_kwargs },
    };
  }

  async getPlaylistDownload(playlist_id) {
    try {
      const playlist_data = await this.getPlayList(playlist_id);
      const trackArray = playlist_data.tracks;
      const concurrentDownloads = 4; // Queue size

      const downloadQueue = [];
      let currentDownloads = 0;

      for (const track of trackArray) {
        const downloadPromise = this.getTrackInfoDownload(track);
        downloadQueue.push(downloadPromise);

        if (++currentDownloads >= concurrentDownloads) {
          // Wait for current downloads to complete
          await Promise.race(downloadQueue);
          // Remove completed promises from the queue
          downloadQueue.splice(0, currentDownloads);
          currentDownloads = 0;
        }
      }

      // Wait for all remaining downloads to complete
      await Promise.all(downloadQueue);

      return "Playlist download complete.";
    } catch (error) {
      console.error(error);
    }
  }

  async getAlbumInfo(album_id) {
    try {
      const album_data = await this.qobuz.getAlbum(album_id);
      const booklet_url =
        album_data.goodies && album_data.goodies.length > 0
          ? album_data.goodies[0].url
          : null;

      let tracks = [];
      let extra_kwargs = {};
      album_data.tracks.items.forEach((track) => {
        const track_id = String(track.id);
        tracks.push({ id: track_id, media_count: track.media_number });
        //track.album = album_data;
        extra_kwargs[track_id] = track;
      });

      let album_name = album_data.title.trim();
      if (album_data.version) {
        album_name += ` (${album_data.version})`;
      }

      const jsonObject = {
        name: album_name,
        artist: album_data.artist.name,
        artist_id: album_data.artist.id,
        media_count: album_data.media_count,
        tracks,
        release_year: parseInt(album_data.release_date_original.split("-")[0]),
        explicit: album_data.parental_warning,
        quality: album_data.hires_streamable
          ? album_data.hires_streamable
          : null,
        description: album_data.description,
        cover_url: album_data.image.large.split("_")[0] + "_org.jpg",
        all_track_cover_jpg_url: album_data.image.large,
        upc: album_data.upc,
        duration: album_data.duration,
        booklet_url,
        track_extra_kwargs: { data: extra_kwargs },
      };

      return jsonObject;
    } catch (error) {
      throw error;
    }
  }

  async getAlbumInfoFile(data, basePath) {
    try {
      const { name, track_extra_kwargs } = data;

      const cleanData = { name, track_extra_kwargs };

      const jsonData = JSON.stringify(cleanData, null, 2);

      const fileName = this.sanitizeFilename(name);
      const filePath = path.resolve(basePath, `${fileName}.txt`);
      fs.writeFileSync(filePath, jsonData, "utf8");
    } catch (error) {
      console.error(error);
    }
  }

  async getAlbumDownload(album_id, progressCallback, artist = false) {
    try {
      const album_data = await this.getAlbumInfo(album_id);
      const trackArray = album_data.tracks;
      const sanitizedAlbumName = `${this.sanitizeFilename(
        album_data.artist
      )}/${this.sanitizeFilename(album_data.name)}`;
      const downloadsPath = path.resolve(this.localpath, sanitizedAlbumName);

      if (!fs.existsSync(downloadsPath)) {
        fs.mkdirSync(downloadsPath, { recursive: true });
      }

      await this.getAlbumInfoFile(album_data, downloadsPath);

      const progress = 100 / trackArray.length;
      let countprogress = 0;
      for (const track of trackArray) {
        countprogress = countprogress + progress;
        await this.getTrackInfoDownloadV2(
          track.id,
          progressCallback,
          album_data.media_count > 1 ? 
          await this.getPathMediaCount(downloadsPath, track.media_count) 
          : downloadsPath,
          artist ? artist : countprogress - 1
        );
      }
      if (!this.covers) {
        await this.cleanupTempPath(
          this.imagePath(downloadsPath, album_data.name)
        );
      }

      progressCallback(
        artist ? artist : 100,
        `Album download ${this.sanitizeFilename(album_data.name)} completed`
      );

      return "Album download complete.";
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async getPathMediaCount(basePath, mediacount){
    const downloadsPath = path.resolve(basePath, `CD${mediacount}`);
    if (!fs.existsSync(downloadsPath)) {
      fs.mkdirSync(downloadsPath, { recursive: true });
    }
    return downloadsPath;
  }

  /*async getAlbumDownloadV2(album_id, progressCallback, artist = false) {
    try {
      const album_data = await this.getAlbumInfo(album_id);
      const trackArray = album_data.tracks;
      const totalTracks = trackArray.length;
      let completedTracks = 0;
      let progressMap = new Map();

      const sanitizedAlbumName = `${this.sanitizeFilename(
        album_data.artist
      )}/${this.sanitizeFilename(album_data.name)}`;
      const downloadsPath = path.resolve(this.localpath, sanitizedAlbumName);

      if (!fs.existsSync(downloadsPath)) {
        fs.mkdirSync(downloadsPath, { recursive: true });
      }

      await this.getAlbumInfoFile(album_data, downloadsPath);

      const concurrentDownloads = 5;
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
          await this.getTrackInfoDownloadV2(
            track,
            (trackProgress, message) => {
              progressMap.set(trackIndex, trackProgress);
              updateProgress(message);
            },
            downloadsPath,
            true
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

      if (!this.covers) {
        await this.cleanupTempPath(
          this.imagePath(downloadsPath, album_data.name)
        );
      }

      progressCallback(artist ? artist : 100, "Album download complete.");
      return "Album download complete.";
    } catch (error) {
      console.error(error);
      throw error;
    }
  }*/

  imagePath(trackPath, name) {
    const imageName = `${name.replace(/[^a-zA-Z0-9]/g, "_")}_cover.jpg`;
    const finalPath = path.join(trackPath, imageName);
    return finalPath;
  }

  async getArtistInfo(artist_id) {
    const artist_data = await this.qobuz.getArtist(artist_id);
    const albums = artist_data.albums.items.map((album) => String(album.id));

    return {
      name: artist_data.name,
      albums,
    };
  }

  async getArtistDownload(artist_id, progressCallback) {
    try {
      const artist_data = await this.getArtistInfo(artist_id);
      console.log(artist_data.name);
      const albums = artist_data.albums;
      progressCallback(
        1,
        `Downloading albums by the artist ${this.sanitizeFilename(
          artist_data.name
        )}.`
      );

      const progress = 100 / albums.length;
      let countprogress = 0;
      for (const album of albums) {
        countprogress = countprogress + progress;
        progressCallback(
          countprogress - 1,
          `Downloading albums by the artist ${this.sanitizeFilename(
            artist_data.name
          )}...`
        );

        await this.getAlbumDownload(album, progressCallback, countprogress - 1);
      }
      progressCallback(
        100,
        `${this.sanitizeFilename(artist_data.name)} Albums download complete.`
      );
      return;
    } catch (error) {
      console.error(error);
    }
  }

  async cleanupTempPath(removePath) {
    if (fs.existsSync(removePath)) await fs.unlink(removePath);
  }

  async getUrlParts(url) {
    const urlObj = new URL(url);
    if (urlObj.hostname == "www.qobuz.com" || urlObj.hostname == "qobuz.com") {
      const urlParts = url
        .match(
          /^https?:\/\/(?:www\.)?qobuz\.com\/[a-z]{2}-[a-z]{2}\/(.*?)\/.*?\/(.*?)$/
        )
        ?.slice(1, 3);
      if (!urlParts) throw new Error("URL not supported");
      urlParts[1] = urlParts[1].replace(/\?.*?$/, "");
      const [type, id] = urlParts;
      switch (type) {
        case "interpreter":
          return ["artist", id];
        case "album":
        case "track":
          return [type, id];
        default:
          throw new Error("URL unrecognised");
      }
    }
    const urlParts = url
      .match(/^https:\/\/(?:play|open)\.qobuz\.com\/(.*?)\/([^/]*?)\/?$/)
      ?.slice(1, 3);
    if (!urlParts) throw new Error("URL not supported");
    urlParts[1] = urlParts[1].replace(/\?.*?$/, "");
    if (
      urlParts[0] != "artist" &&
      urlParts[0] != "album" &&
      urlParts[0] != "track"
    ) {
      throw new Error("URL unrecognised");
    }
    return [urlParts[0], urlParts[1]];
  }

  async getByUrl(url, progressCallback) {
    const [type, id] = await this.getUrlParts(url);
    switch (type) {
      case "track":
        return this.getTrackInfoDownloadV2(id, progressCallback);
      case "album":
        return this.getAlbumDownload(id, progressCallback);
      case "artist":
        await this.getArtistDownload(id, progressCallback);
        return;
      default:
        throw new Error("URL unrecognised");
    }
  }
}

export default ModuleInterface;
