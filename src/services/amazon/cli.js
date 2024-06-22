import fs from 'fs-extra';
import Downloader from './downloader';

// Leer configuraciones desde el archivo .env
const config = {
  cookiesPath: process.env.COOKIES_PATH || './src/services/amazon/cookies.txt',
  metadataLanguage: process.env.METADATA_LANGUAGE || 'en_US',
  outputPath: process.env.OUTPUT_PATH || './output',
  tempPath: process.env.TEMP_PATH || './temp',
  wvdPath: process.env.WVD_PATH || './wvd',
  ffmpegPath: process.env.FFMPEG_PATH || '/usr/local/bin/ffmpeg',
  mp4boxPath: process.env.MP4BOX_PATH || '/usr/local/bin/MP4Box',
  mp4decryptPath: process.env.MP4DECRYPT_PATH || '/usr/local/bin/mp4decrypt',
  aria2cPath: process.env.ARIA2C_PATH || '/usr/local/bin/aria2c',
  codec: process.env.CODEC || 'MP3',
  codecQuality: process.env.CODEC_QUALITY || 320,
  removeFlacWatermark: process.env.REMOVE_FLAC_WATERMARK || true,
  downloadMode: process.env.DOWNLOAD_MODE || 'DEFAULT',
  remuxMode: process.env.REMUX_MODE || 'DEFAULT',
  templateFolder: process.env.TEMPLATE_FOLDER || './templates',
  templateFileSingleDisc: process.env.TEMPLATE_FILE_SINGLE_DISC || 'single_disc_template',
  templateFileMultiDisc: process.env.TEMPLATE_FILE_MULTI_DISC || 'multi_disc_template',
  templateDate: process.env.TEMPLATE_DATE || 'YYYY-MM-DD',
  truncate: process.env.TRUNCATE || 100,
  coverSize: process.env.COVER_SIZE || 500,
  coverQuality: process.env.COVER_QUALITY || 90,
  excludeTags: process.env.EXCLUDE_TAGS || 'explicit',
};

const urls = process.argv.slice(2);

(async () => {
  const downloader = new Downloader(config);

  let errorCount = 0;

  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const url = urls[urlIndex];
    const urlProgress = `URL ${urlIndex + 1}/${urls.length}`;

    try {
      console.log(`(${urlProgress}) Checking "${url}"`);
      const urlInfo = await downloader.getUrlInfo(url);

      let downloadQueueRaw = (await downloader.getDownloadQueue(urlInfo)).filter(
        (item) => item.metadataTrack.assetType === 'AUDIO'
      );

      let downloadQueue = downloadQueueRaw.filter(
        (item) => item.metadataTrack.isMusicSubscription
      );

      const skippedTracks = downloadQueueRaw.length - downloadQueue.length;

      if (skippedTracks) {
        console.warn(`(${urlProgress}) Skipping ${skippedTracks} non-streamable track(s)`);
      } else if (skippedTracks === downloadQueue.length) {
        console.warn(`(${urlProgress}) No streamable tracks found, skipping`);
        continue;
      }

      const tracksAsin = downloadQueue.map((item) => item.metadataTrack.asin);

      console.log(`(${urlProgress}) Getting stream info`);
      const tracksStreamInfo = await downloader.getStreamInfo(tracksAsin, urlInfo.country);

      console.log(`(${urlProgress}) Getting lyrics`);
      const tracksLyrics = await downloader.getLyrics(tracksAsin, urlInfo.country);

      for (let queueIndex = 0; queueIndex < downloadQueue.length; queueIndex++) {
        const queueItem = downloadQueue[queueIndex];
        const trackLyrics = tracksLyrics[queueIndex];
        const trackStreamInfo = tracksStreamInfo[queueIndex];
        const queueProgress = `Track ${queueIndex + 1}/${downloadQueue.length} from URL ${urlIndex + 1}/${urls.length}`;

        const trackMetadata = queueItem.metadataTrack;
        const albumMetadata = queueItem.metadataAlbum;

        console.log(`(${queueProgress}) Downloading "${trackMetadata.title}"`);

        try {
          if (!trackStreamInfo) {
            console.warn(`(${queueProgress}) Track is not available with the chosen codec, skipping`);
            continue;
          }

          const tags = downloader.getTags(trackMetadata, albumMetadata, trackLyrics.unsynced);
          const finalPath = downloader.getFinalPath(tags, trackStreamInfo.codec);
          const lrcPath = downloader.getLrcPath(finalPath);
          const coverPath = downloader.getCoverPath(finalPath);

          console.log(`Getting cover URL`);
          const coverUrl = downloader.getCoverUrl(albumMetadata, urlInfo.country);

          if (!lrcOnly && finalPath.exists() && !overwrite) {
            console.warn(`(${queueProgress}) Track already exists at "${finalPath}", skipping`);
          } else if (!lrcOnly) {
            console.log(`Downloading to "${finalPath}"`);
            await downloader.download(trackStreamInfo.streamUrl, finalPath);

            console.log(`Decrypting/Remuxing to "${finalPath}"`);
            await downloader.remux(trackStreamInfo, finalPath);

            console.log(`Applying tags`);
            await downloader.applyTags(finalPath, tags, coverUrl, trackStreamInfo.codec);

            console.log(`Moving to "${finalPath}"`);
            await downloader.moveToFinalPath(finalPath);
          }

          if (!noLrc && trackLyrics.synced && (!lrcPath.exists() || overwrite)) {
            console.log(`Saving synced lyrics to "${lrcPath}"`);
            await downloader.saveLrc(lrcPath, trackLyrics.synced);
          }

          if (saveCover && !lrcOnly && (!coverPath.exists() || overwrite)) {
            console.log(`Saving cover to "${coverPath}"`);
            await downloader.saveCover(coverPath, coverUrl);
          }
        } catch (error) {
          errorCount++;
          console.error(`(${queueProgress}) Failed to download "${trackMetadata.title}"`, error);
          continue;
        } finally {
          if (fs.existsSync(config.tempPath)) {
            console.log(`Cleaning up "${config.tempPath}"`);
            await downloader.cleanupTempPath();
          }
        }
      }
    } catch (error) {
      errorCount++;
      console.error(`(${urlProgress}) Failed to check "${url}"`, error);
      continue;
    }
  }

  console.log(`Done (${errorCount} errors)`);
})();
