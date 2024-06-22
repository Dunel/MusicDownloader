import { execSync } from "child_process";
import fs from "fs-extra";
import path, { resolve } from "path";
import inquirer from "inquirer";
import AmazonMusicApi from "./amazon";
import { COUNTRIES } from "./enum";
import ytdl from "ytdl-core";
import { StreamInfo, Codec, DownloadMode, RemuxMode, Lyrics } from "./model";
import { DOMParser } from "xmldom";
import axios from "axios";
import crypto from "crypto";
import protobuf from "protobufjs";
import tagFile from "./tagging";

class Downloader {
  constructor(config) {
    this.codec = config.codec || { value: [] };
    this.codecQuality = config.codecQuality || 1;
    this.amazonMusicApi = new AmazonMusicApi();
    this.outputPath = resolve(config.outputPath);
    this.tempPath = resolve(config.tempPath);
    this.wvdPath = config.wvdPath;
    this.ffmpegPath = "ffmpeg";
    this.mp4boxPath = config.mp4boxPath;
    this.mp4decryptPath = config.mp4decryptPath;
    this.aria2cPath = config.aria2cPath;
    this.removeFlacWatermark = false;
    this.downloadMode = config.downloadMode;
    this.remuxMode = RemuxMode.FFMPEG;
    this.templateFolder = config.templateFolder;
    this.templateFileSingleDisc = config.templateFileSingleDisc;
    this.templateFileMultiDisc = config.templateFileMultiDisc;
    this.templateDate = config.templateDate;
    this.truncate = config.truncate;
    this.coverSize = config.coverSize;
    this.coverQuality = config.coverQuality;
    this.excludeTags = config.excludeTags;
    this.silent = config.silent;
    this._setExcludeTagsList();
    this._setBinariesFullPath();
    this._setSubprocessAdditionalArgs();
  }

  _setExcludeTagsList() {
    this.excludeTagsList = this.excludeTags
      ? this.excludeTags.split(",").map((tag) => tag.trim().toLowerCase())
      : [];
  }

  _setBinariesFullPath() {
    this.ffmpegPathFull = this.ffmpegPath ? this.ffmpegPath : null;
    this.mp4boxPathFull = this.mp4boxPath ? this.mp4boxPath : null;
    this.mp4decryptPathFull = this.mp4decryptPath ? this.mp4decryptPath : null;
    this.aria2cPathFull = this.aria2cPath ? this.aria2cPath : null;
  }

  _setSubprocessAdditionalArgs() {
    this.subprocessAdditionalArgs = this.silent ? { stdio: "ignore" } : {};
  }

  setCdm() {
    if (this.wvdPath) {
      this.cdm = Cdm.fromDevice(Device.load(this.wvdPath));
    } else {
      this.cdm = Cdm.fromDevice(Device.loads(HARDCODED_WVD));
    }
  }

  async getUrlInfo(url) {
    const suffix = new URL(url).hostname.split(".").slice(-2).join(".");
    let country = url.match(/musicTerritory=([A-Z]{2})/);
    if (!country) {
      country =
        Object.keys(COUNTRIES).find(
          (key) => COUNTRIES[key].suffix === suffix
        ) || "US";
    } else {
      country = country[1];
    }
    const asin = url.match(/\b([A-Z0-9]{10})\b/);
    const playlistId = url.match(/\/user-playlists\/([a-z0-9]*)/);
    if (!asin && !playlistId) {
      throw new Error("Invalid URL");
    }

    return {
      country,
      asin: asin ? asin[0] : null,
      playlistId: playlistId ? playlistId[1] : null,
    };
  }

  getUrlParts(url) {
    const urlParts = url
      .match(
        /^https?:\/\/music\.amazon\.com\/(artists|albums|tracks|playlists)\/(.*?)\/?(?:\?.*)?$/
      )
      ?.slice(1, 3);

    if (!urlParts)
      throw new Error(
        "URL not supported. Please enter a valid Amazon Music URL."
      );

    let asin = url.match(/\b([A-Z0-9]{10})\b/);
    if (!asin) {
      throw new Error("Invalid URL");
    }

    if (
      urlParts[0] !== "artists" &&
      urlParts[0] !== "albums" &&
      urlParts[0] !== "tracks" &&
      urlParts[0] !== "playlists"
    ) {
      throw new Error(
        "URL unrecognized. Please enter a URL for an artist, album, track, or playlist."
      );
    }

    let country = url.match(/musicTerritory=([A-Z]{2})/);
    if (!country) {
      const suffix = url.match(/^https?:\/\/music\.amazon\.(.*?)\//)[1];
      country =
        Object.keys(COUNTRIES).find(
          (key) => COUNTRIES[key].suffix === suffix
        ) || "US";
    } else {
      country = country[1];
    }

    return { type: urlParts[0], asin: asin[0], country };
  }

  async getByUrl(url /*, progressCallback*/) {
    const { type, asin, country } = this.getUrlParts(url);
    switch (type) {
      case "tracks":
        return this.startDownloader(asin, country);
      case "albums":
        return { type, asin, country };
      case "artists":
        return { type, asin, country };
      case "playlists":
        return { type, asin, country };
      default:
        throw new Error("Invalid URL type");
    }
  }

  async getDownloadQueue(urlInfo) {
    if (urlInfo.playlistId) {
      return await this._getDownloadQueuePlaylist(
        urlInfo.playlistId,
        urlInfo.country
      );
    } else if (urlInfo.asin) {
      return await this._getDownloadQueueAsin(urlInfo.asin, urlInfo.country);
    }
  }

  async _getDownloadQueueAsin(asin, country) {
    const results = [];
    const metadata = await this.amazonMusicApi.getMetadata(asin, country);

    if (metadata.trackList) {
      results.push({
        album: metadata.albumList[0],
        track: metadata.trackList[0],
      });
    } else if (metadata.albumList) {
      for (const trackMetadata of metadata.albumList[0].tracks) {
        results.push({ album: metadata.albumList[0], track: trackMetadata });
      }
    } else if (metadata.playlistList) {
      const playlistAlbumsAsin = new Set(
        metadata.playlistList[0].tracks.map((track) => track.album.asin)
      );
      const albumsMetadata = await this.amazonMusicApi.getMetadata(
        [...playlistAlbumsAsin],
        country
      );
      for (const trackMetadata of metadata.playlistList[0].tracks) {
        const album = albumsMetadata.albumList.find(
          (album) => album.asin === trackMetadata.album.asin
        );
        results.push({ album, track: trackMetadata });
      }
    } else if (metadata.artistList) {
      for (const artistMetadata of metadata.artistList) {
        const artistResults = await this._getDownloadQueueArtist(
          artistMetadata.asin,
          country
        );
        results.push(...artistResults);
      }
    }
    return results;
  }

  async _getDownloadQueuePlaylist(playlistId, country) {
    const results = [];
    const userPlaylist = (
      await this.amazonMusicApi.getPlaylist(playlistId, country)
    ).playlists[0];
    const playlistAlbumsAsin = new Set(
      userPlaylist.tracks.map((track) => track.metadata.albumAsin)
    );
    const playlistTracksAsins = userPlaylist.tracks.map(
      (track) => track.metadata.asin
    );
    const albumsMetadata = await this.amazonMusicApi.getMetadata(
      [...playlistAlbumsAsin],
      country
    );
    for (const playlistTrackAsin of playlistTracksAsins) {
      for (const album of albumsMetadata.albumList) {
        const trackMetadata = album.tracks.find(
          (track) => track.asin === playlistTrackAsin
        );
        if (trackMetadata) {
          results.push({ album, track: trackMetadata });
          break;
        }
      }
    }
    return results;
  }

  async _getDownloadQueueArtist(asinArtist, country) {
    const results = [];
    const choices = [];
    for await (const artistReleases of this.amazonMusicApi.getArtistReleases(
      asinArtist,
      country
    )) {
      for (const artistRelease of artistReleases.content.blocks[0].content
        .entities) {
        const releaseDate = artistRelease.originalReleaseDate;
        choices.push({
          name: `${artistRelease.tracksCount} | ${
            releaseDate ? new Date(releaseDate).toISOString().split("T")[0] : ""
          } | ${artistRelease.title}`,
          value: artistRelease,
        });
      }
    }
    const selected = await inquirer.prompt([
      {
        type: "checkbox",
        name: "albums",
        message:
          "Select which albums to download: (Track Count | Release Date | Title)",
        choices,
      },
    ]);
    const albumsAsin = selected.albums.map((album) => album.asin);
    const albumsMetadata = await this.amazonMusicApi.getMetadata(
      albumsAsin,
      country
    );
    for (const artistRelease of albumsMetadata.albumList) {
      for (const trackMetadata of artistRelease.tracks) {
        results.push({ album: artistRelease, track: trackMetadata });
      }
    }
    return results;
  }

  async getStreamInfo(asin, country = null) {
    const manifests = await this.amazonMusicApi.getManifest(asin, country);
    const streamInfos = [];

    for (const manifestApi of manifests) {
      for (const contentResponse of manifestApi.contentResponseList) {
        const manifest = contentResponse.manifest.replace(/xmlns="[^"]+"/, "");
        const streamInfo = this._getStreamInfo(manifest);
        streamInfos.push(streamInfo);
      }
    }

    return streamInfos;
  }

  _getStreamInfo(manifest) {
    const namespaces = {
      drm: "urn:mpeg:cenc:2013",
      amz: "urn:amazon:music:drm:2019",
    };

    const streamInfo = new StreamInfo();
    const parser = new DOMParser();
    const manifestDoc = parser.parseFromString(manifest, "application/xml");

    const adaptationSets = manifestDoc.getElementsByTagName("AdaptationSet");

    for (let i = 0; i < adaptationSets.length; i++) {
      const adaptationSet = adaptationSets[i];
      let trackTypeElement = null;
      const supplementalProperties = adaptationSet.getElementsByTagName(
        "SupplementalProperty"
      );

      for (let j = 0; j < supplementalProperties.length; j++) {
        const supplementalProperty = supplementalProperties[j];
        if (
          supplementalProperty.getAttribute("schemeIdUri") ===
          "amz-music:trackType"
        ) {
          trackTypeElement = supplementalProperty;
          break;
        }
      }

      if (!trackTypeElement) continue;

      const trackType = trackTypeElement.getAttribute("value");

      if (!this.codec.includes(trackType)) continue;

      const representations = Array.from(
        adaptationSet.getElementsByTagName("Representation")
      )
        .filter((representation) =>
          this.codec.includes(
            representation.getAttribute("codecs").split(".")[0]
          )
        )
        .sort(
          (a, b) =>
            parseInt(a.getAttribute("qualityRanking")) -
            parseInt(b.getAttribute("qualityRanking"))
        );

      if (representations.length === 0) continue;

      const contentProtections =
        adaptationSet.getElementsByTagName("ContentProtection");

      streamInfo.psshsEntitlement = {};

      for (let j = 0; j < contentProtections.length; j++) {
        const contentProtection = contentProtections[j];

        if (contentProtection.getAttribute("cenc:default_KID")) {
          streamInfo.kid = contentProtection
            .getAttribute("cenc:default_KID")
            .replace(/-/g, "")
            .toLowerCase();
        }

        if (
          contentProtection.getAttribute("schemeIdUri") ===
            "urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" &&
          contentProtection.getAttribute("value") === "AmzMusic-2019"
        ) {
          const groupIdNode = contentProtection.getElementsByTagNameNS(
            namespaces.amz,
            "groupId"
          )[0];
          const psshNode = contentProtection.getElementsByTagNameNS(
            namespaces.drm,
            "pssh"
          )[0];
          if (groupIdNode && psshNode) {
            const groupId = groupIdNode.textContent.split(":")[0];
            streamInfo.psshsEntitlement[groupId] = psshNode.textContent;
          }
        }

        if (
          contentProtection.getAttribute("schemeIdUri") ===
            "urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" &&
          !contentProtection.getAttribute("value")
        ) {
          const psshNode = contentProtection.getElementsByTagNameNS(
            namespaces.drm,
            "pssh"
          )[0];
          if (psshNode) {
            streamInfo.psshWidevine = psshNode.textContent;
          }
        }
      }

      for (let j = 0; j < representations.length; j++) {
        if (j === this.codecQuality - 1 || j === representations.length - 1) {
          const baseURLNode =
            representations[j].getElementsByTagName("BaseURL")[0];
          if (baseURLNode) {
            streamInfo.codec = this.codec;
            streamInfo.streamUrl = baseURLNode.textContent;
            streamInfo.sampleRate = parseInt(
              representations[j].getAttribute("audioSamplingRate")
            );
            return streamInfo;
          }
        }
      }
    }

    return streamInfo;
  }

  async getDecryptionKey(streamInfo, country) {
    const masterKeys = COUNTRIES[country]?.master_keys || {};
    let decryptionKey = await this.getDecryptionKeyEntitlement(
      streamInfo.psshsEntitlement,
      masterKeys
    );
    /*if (!decryptionKey && streamInfo.psshWidevine) {
      decryptionKey = await this.getDecryptionKeyWidevine(
        streamInfo.psshWidevine
      );
    }*/
    //console.log(`Decryption Key: ${decryptionKey}`);
    return decryptionKey;
  }

  async getDecryptionKeyEntitlement(psshsEntitlement, masterKeys) {
    if (!psshsEntitlement || !Object.keys(psshsEntitlement).length) {
      console.error("psshsEntitlement is null or empty:", psshsEntitlement);
      return null;
    }

    let pssh = null;
    let masterKey = null;
    for (const [groupId, _pssh] of Object.entries(psshsEntitlement)) {
      if (masterKeys[groupId]) {
        masterKey = masterKeys[groupId];
        pssh = _pssh;
        break;
      }
    }
    if (!pssh) return null;

    try {
      //console.log("pssh: " + pssh);
      const data = Buffer.from(pssh, "base64");
      const psshData = await this.widevineProto(data);

      //console.log("psshData: ", psshData);
      const keys = psshData.entitledKeys[0];
      //console.log("psshDataWide: ", keys);

      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(masterKey, "hex"),
        Buffer.from(keys.iv, "base64")
      );
      let decrypted = decipher.update(Buffer.from(keys.key, "base64"));
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.subarray(0, 16).toString("hex");
    } catch (error) {
      console.error("Error decrypting key:", error);
      return null;
    }
  }

  async widevineProto(buffer) {
    try {
      const data = buffer.subarray(32);
      const root = await protobuf.load(
        path.join(process.cwd(), "./src/services/amazon/WidevinePsshData.proto")
      );
      const WidevinePsshData = root.lookupType("WidevinePsshData");
      const decodedMessage = WidevinePsshData.decode(data);
      const object = WidevinePsshData.toObject(decodedMessage, {
        longs: String,
        enums: String,
        bytes: String,
        defaults: true,
        arrays: true,
        objects: true,
      });

      return object;
    } catch (error) {
      console.error("Error in widevineProto:", error);
      return null;
    }
  }

  /*async getDecryptionKeyWidevine(pssh) {
    try {
      const psshDataBytes = base64.toByteArray(pssh);
      const psshObj = parsePssh(psshDataBytes);

      const cdmSession = this.cdm.open();
      const challenge = Buffer.from(
        this.cdm.getLicenseChallenge(cdmSession, psshObj)
      ).toString("base64");

      const license = await this.amazonMusicApi.getWidevineLicense(challenge);
      this.cdm.parseLicense(cdmSession, license.license);

      const decryptionKey = this.cdm
        .getKeys(cdmSession)
        .find((key) => key.type === "CONTENT")
        .key.toString("hex");

      this.cdm.close(cdmSession);
      return decryptionKey;
    } catch (error) {
      console.error("Error in getDecryptionKeyWidevine:", error);
      return null;
    }
  }*/

  parseTimestampLrc(timestamp) {
    return (
      new Date(timestamp / 1000).toISOString().substr(14, 5) +
      "." +
      Math.floor((timestamp % 1000) / 10)
        .toString()
        .padStart(2, "0")
    );
  }

  async getLyrics(asin, country) {
    let lastLyric;
    const lyricsApis = await this.amazonMusicApi.getLyrics(asin, country);

    for (const lyricsApi of lyricsApis) {
      const lyrics = await this._getLyrics(lyricsApi);
      for (const lyric of lyrics) {
        lastLyric = lyric;
      }
    }

    return lastLyric;
  }

  async _getLyrics(lyricsApi) {
    const lyricsList = [];
    for (const _lyrics of lyricsApi.lyricsResponseList) {
      const lyricsObj = new Lyrics();
      if (_lyrics.lyricsResponseCode === 2001) {
        lyricsList.push(lyricsObj);
      } else {
        lyricsObj.unsynced = _lyrics.lyrics.lines
          .map((line) => line.text)
          .join("\n");
        lyricsObj.synced = _lyrics.lyrics.lines
          .map(
            (line) => `[${this.parseTimestampLrc(line.startTime)}]${line.text}`
          )
          .join("\n");
        lyricsList.push(lyricsObj);
      }
    }
    return lyricsList;
  }

  async getCoverUrl(albumMetadata, country) {
    const coverUrlRaw =
      (await this._getCoverUrlRaw(albumMetadata.asin, country)) ||
      albumMetadata.image;
    const coverUrlTemplate = this._getCoverUrlTemplate(coverUrlRaw);
    console.log(coverUrlTemplate);
    return coverUrlTemplate
      .replace("{size}", this.coverSize)
      .replace("{quality}", this.coverQuality);
  }

  async _getCoverUrlRaw(albumAsin, country) {
    const results = await this.amazonMusicApi.getSearchResults(
      albumAsin,
      country
    );
    for (const hit of results.results[0].hits) {
      if (hit.document.asin === albumAsin) {
        return hit.document.artOriginal.URL;
      }
    }
    return null;
  }

  _getCoverUrlTemplate(coverUrlRaw) {
    return coverUrlRaw.replace(".jpg", ".SX{size}_QL{quality}.jpg");
  }

  getWriter(writerList) {
    return writerList.length === 1
      ? writerList[0]
      : writerList.slice(0, -1).join(", ") + " & " + writerList.slice(-1);
  }

  parseDate(timestamp) {
    return new Date(timestamp * 1000);
  }

  getTags(metadataTrack, metadataAlbum, lyricsUnsynced, country) {
    country = country || this.amazonMusicApi.appConfig.musicTerritory;
    const urlSuffix = COUNTRIES[country].suffix || "com";
    const date = metadataTrack.originalReleaseDate
      ? this.parseDate(metadataTrack.originalReleaseDate / 1000)
      : metadataAlbum.originalReleaseDate
      ? this.parseDate(metadataAlbum.originalReleaseDate / 1000)
      : null;
    return {
      album: metadataAlbum.title,
      artist: metadataTrack.artist.name,
      composer: metadataTrack.songWriters
        ? this.getWriter(metadataTrack.songWriters)
        : null,
      copyright: metadataAlbum.productDetails.copyright,
      date: date ? date.toISOString().split("T")[0] : null,
      disc:
        parseInt(metadataTrack.discNum) +
        "/" +
        parseInt(metadataAlbum.tracks[metadataAlbum.tracks.length - 1].discNum),
      genre: metadataTrack.genreName,
      isrc: metadataTrack.isrc,
      label: metadataAlbum.label,
      lyrics: lyricsUnsynced,
      //media_type: 1,
      explicit: metadataTrack.parentalControls.hasExplicitLanguage
        ? "Explicit"
        : "Clean",
      //const bpmRealTime = await bpm(sddff)
      //bpm: bpm, //Realtime BPM Analyzer
      title: metadataTrack.title,
      tracknumber:
        parseInt(metadataTrack.trackNum) +
        "/" +
        Math.max(
          ...metadataAlbum.tracks
            .filter((track) => track.discNum === metadataTrack.discNum)
            .map((track) => parseInt(track.trackNum))
        ),
      url: `https://music.amazon.${urlSuffix}/albums/${metadataAlbum.asin}?trackAsin=${metadataTrack.asin}`,
    };
  }

  getSanitizedString(dirtyString, isFolder) {
    dirtyString = dirtyString.replace(/[\\/:*?"<>|;]/g, "_");
    if (isFolder) {
      dirtyString = dirtyString.substr(0, this.truncate);
      if (dirtyString.endsWith("."))
        dirtyString = dirtyString.slice(0, -1) + "_";
    } else {
      dirtyString = dirtyString.substr(0, this.truncate - 5);
    }
    return dirtyString.trim();
  }

  getFinalPath(tags, codec) {
    const fileExtension = this.getFileExtension(codec);
    const finalPathFolder = this.templateFolder.split("/").map((part) =>
      this.getSanitizedString(
        part.replace(/\{(\w+)\}/g, (_, key) => tags[key]),
        true
      )
    );
    const finalPathFile = (
      tags.disc_total > 1
        ? this.templateFileMultiDisc
        : this.templateFileSingleDisc
    )
      .split("/")
      .map((part, index, arr) =>
        index === arr.length - 1
          ? this.getSanitizedString(
              part.replace(/\{(\w+)\}/g, (_, key) => tags[key]),
              false
            ) + fileExtension
          : this.getSanitizedString(
              part.replace(/\{(\w+)\}/g, (_, key) => tags[key]),
              true
            )
      );
    return path.join(this.outputPath, ...finalPathFolder, ...finalPathFile);
  }

  getFileExtension(codec) {
    return codec === Codec.FLAC_HD ? ".flac" : ".m4a";
  }

  getEncryptedPath(asin) {
    return path.join(this.tempPath, `${asin}_encrypted.m4a`);
  }

  getDecryptedPath(asin) {
    return path.join(this.tempPath, `${asin}_decrypted.m4a`);
  }

  getRemuxedPath(asin, codec) {
    return path.join(
      this.tempPath,
      `${asin}_fixed${this.getFileExtension(codec)}`
    );
  }

  getCoverPath(finalPath) {
    return path.join(finalPath, "..", "Cover.jpg");
  }

  getLrcPath(finalPath) {
    return finalPath.replace(/\.\w+$/, ".lrc");
  }

  async downloadAria2c(downloadPath, streamUrl) {
    fs.mkdirpSync(path.dirname(downloadPath));
    execSync(
      `${this.aria2cPathFull} --no-conf --download-result=hide --console-log-level=error --summary-interval=0 --file-allocation=none ${streamUrl} --out ${downloadPath}`,
      this.subprocessAdditionalArgs
    );
  }

  async startDownloader(asin, country) {
    try {
      const metadata = await this.amazonMusicApi.getMetadata(asin, country);
      if(!metadata.metadata.trackList){
        throw new Error("Invalid Amazon URL");
      }
      console.log(metadata.metadata.trackList)
      const getstreamInfo = await this.getStreamInfo(asin, country);
      const streamInfo = getstreamInfo[0];
      console.log(streamInfo)
      const decryption_key = await this.getDecryptionKey(streamInfo, country);
      const encryptedPath = this.getEncryptedPath(asin);
      const decryptedPath = this.getDecryptedPath(asin);
      const remuxedPath = this.getRemuxedPath(asin, streamInfo.codec);
      const urlStream = streamInfo.streamUrl;

      const lyrics = await this.getLyrics(asin, country);
      let lyricsUnsynced;
      if (lyrics.unsynced) {
        lyricsUnsynced = lyrics.unsynced.replace(/\n/g, "/ ").substring(0, 200);
      }
      const coverUrl = await this.getCoverUrl(metadata.albumList[0], country);
      const tags = this.getTags(
        metadata.trackList[0],
        metadata.albumList[0],
        lyricsUnsynced,
        country
      );
      const finalPath = path.join(
        this.outputPath,
        `${this.sanitizeFilename(tags.artist)} - ${this.sanitizeFilename(
          tags.title
        )}.flac`
      );

      await this.downloadFile(urlStream, encryptedPath);
      await this.remux(
        decryption_key,
        encryptedPath,
        decryptedPath,
        remuxedPath,
        streamInfo
      );
      await this.applyTags(
        remuxedPath,
        tags,
        coverUrl,
        this.outputPath,
        streamInfo.codec
      );
      await this.moveToFinalPath(remuxedPath, finalPath);
      await this.cleanupTempPath(encryptedPath);
      return tags;
    } catch (error) {
      console.error("Error starDownloader: ", error.message);
      throw error
    }
  }

  async downloadFile(urlStream, encryptedPath) {
    try {
      if (!fs.existsSync(this.tempPath)) {
        fs.mkdirSync(this.tempPath, { recursive: true });
      }

      const response = await axios({
        url: urlStream,
        method: "GET",
        responseType: "stream",
      });

      const writer = fs.createWriteStream(encryptedPath);

      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    } catch (error) {
      console.error("Error downloadFile: ", error);
      throw error;
    }
  }

  sanitizeFilename(name) {
    return name
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  async downloadYtdlp(downloadPath, streamUrl) {
    const ytdlOptions = {
      filter: "audioonly",
      quality: "highestaudio",
      format: "bestaudio",
      output: downloadPath,
      ffmpegLocation: this.ffmpegPath,
    };
    await ytdl(streamUrl, ytdlOptions).pipe(fs.createWriteStream(downloadPath));
  }

  async download(streamUrl, downloadPath) {
    if (this.downloadMode === DownloadMode.ARIA2C) {
      await this.downloadAria2c(downloadPath, streamUrl);
    } else if (this.downloadMode === DownloadMode.YTDLP) {
      await this.downloadYtdlp(downloadPath, streamUrl);
    }
  }

  async remux(
    decryptionKey,
    encryptedPath,
    decryptedPath,
    remuxedPath,
    streamInfo
  ) {
    try {
      if (
        this.remuxMode === RemuxMode.FFMPEG ||
        streamInfo.codec === Codec.FLAC_HD
      ) {
        await this.remuxFfmpeg(
          decryptionKey,
          encryptedPath,
          remuxedPath,
          streamInfo.sampleRate
        );
      } else if (this.remuxMode === RemuxMode.MP4BOX) {
        await this.decrypt(decryptionKey, encryptedPath, decryptedPath);
        await this.remuxMp4box(decryptedPath, remuxedPath);
      } else if (this.remuxMode === RemuxMode.MP4DECRYPT) {
        await this.decrypt(decryptionKey, encryptedPath, remuxedPath);
      }
    } catch (error) {
      console.error(error);
      throw new Error(error);
    }
  }

  async remuxFfmpeg(
    decryptionKey,
    encryptedPath,
    remuxedPath,
    sampleRate = null
  ) {
    const commands = [
      this.ffmpegPath,
      "-loglevel",
      "error",
      "-y",
      "-decryption_key",
      decryptionKey,
      "-i",
      encryptedPath,
    ];
    if (this.removeFlacWatermark && sampleRate) {
      commands.push(
        "-af",
        `atrim=start_sample=${Math.floor(sampleRate * 0.0065)}`,
        "-compression_level",
        "8"
      );
    } else if (sampleRate) {
      commands.push("-c", "copy");
    }
    commands.push(remuxedPath);

    //console.log(`Ejecutando comando ffmpeg: ${commands.join(" ")}`);

    try {
      execSync(commands.join(" "), { stdio: "inherit" });
      console.log(`Archivo remuxed guardado en: ${remuxedPath}`);
    } catch (error) {
      console.error(`Error ejecutando ffmpeg: ${error}`);
      throw error;
    }
  }

  async decrypt(decryptionKey, inputPath, outputPath) {
    execSync(
      `${this.mp4decryptPathFull} --key 1:${decryptionKey} ${inputPath} ${outputPath}`,
      this.subprocessAdditionalArgs
    );
  }

  async remuxMp4box(inputPath, outputPath) {
    execSync(
      `${this.mp4boxPathFull} -quiet -add ${inputPath} -itags artist=placeholder -keep-utc -new ${outputPath}`,
      this.subprocessAdditionalArgs
    );
  }

  async applyTags(remuxedPath, tags, coverUrl, coverPath, codec) {
    //const cover = await this.getResponseBytesCached(coverUrl);
    if (codec === Codec.FLAC_HD) {
      await tagFile(tags, coverUrl, coverPath, remuxedPath);
      //await this.applyFlacTags(remuxedPath, tags, cover);
    } else {
      await this.applyMp4Tags(remuxedPath, tags, cover);
    }
  }

  /*async applyFlacTags(inputPath, tags, cover) {
    const file = new FLAC(inputPath);
    file.clear();
    const flacTags = {};
    for (const [k, v] of Object.entries(FLAC_TAGS_MAP)) {
      if (!this.excludeTagsList.includes(k) && tags[k]) {
        flacTags[v] = tags[k].toString();
      }
    }
    file.update(flacTags);
    if (!this.excludeTagsList.includes("cover")) {
      const picture = new Picture();
      picture.mime = "image/jpeg";
      picture.data = cover;
      picture.type = 3;
      const img = new Image();
      img.src = cover;
      picture.width = img.width;
      picture.height = img.height;
      file.addPicture(picture);
    }
    file.save();
  }*/

  async applyMp4Tags(inputPath, tags, cover) {
    const mp4 = new MP4(inputPath);
    mp4.clear();
    const mp4Tags = {};
    for (const tagName of Object.keys(tags)) {
      if (!this.excludeTagsList.includes(tagName)) {
        if (tagName === "disc" || tagName === "disc_total") {
          if (!mp4Tags.disk) mp4Tags.disk = [[0, 0]];
          if (tagName === "disc") {
            mp4Tags.disk[0][0] = tags[tagName];
          } else {
            mp4Tags.disk[0][1] = tags[tagName];
          }
        } else if (tagName === "track" || tagName === "track_total") {
          if (!mp4Tags.trkn) mp4Tags.trkn = [[0, 0]];
          if (tagName === "track") {
            mp4Tags.trkn[0][0] = tags[tagName];
          } else {
            mp4Tags.trkn[0][1] = tags[tagName];
          }
        } else if (tagName === "isrc") {
          mp4Tags["----:com.apple.iTunes:ISRC"] = [
            new MP4FreeForm(Buffer.from(tags.isrc)),
          ];
        } else if (tagName === "label") {
          mp4Tags["----:com.apple.iTunes:LABEL"] = [
            new MP4FreeForm(Buffer.from(tags.label)),
          ];
        } else if (MP4_TAGS_MAP[tagName] && tags[tagName]) {
          mp4Tags[MP4_TAGS_MAP[tagName]] = [tags[tagName]];
        }
      }
    }
    if (!this.excludeTagsList.includes("cover")) {
      mp4Tags.covr = [new MP4Cover(cover, { format: MP4Cover.FORMAT_JPEG })];
    }
    mp4.update(mp4Tags);
    mp4.save();
  }

  async moveToFinalPath(fixedPath, finalPath) {
    await fs.ensureDir(path.dirname(finalPath));
    await fs.move(fixedPath, finalPath);
  }

  async saveCover(coverPath, coverUrl) {
    const cover = await this.getResponseBytesCached(coverUrl);
    fs.writeFileSync(coverPath, cover);
  }

  async saveLrc(lrcPath, syncedLyrics) {
    fs.writeFileSync(lrcPath, syncedLyrics, "utf8");
  }

  async cleanupTempPath(removePath) {
    await fs.unlink(removePath);
  }

  /*async getResponseBytesCached(url) {
    const response = await fetch(url);
    return await response.buffer();
  }*/
}

export default Downloader;
