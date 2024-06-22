// services/tagging.js
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";

async function addMetadataToFlac(filePath, metadata) {
  return new Promise((resolve, reject) => {
    const commands = Object.entries(metadata).map(([key, value]) => {
      return `metaflac --set-tag="${key}=${value}" "${filePath}"`;
    });

    const command = commands.join(' && ');

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error adding metadata: ${stderr}`);
        reject(error);
      } else {
        console.log('Metadata added successfully!');
        resolve(stdout);
      }
    });
  });
}

async function addCoverToFlac(filePath, coverImagePath) {
  return new Promise((resolve, reject) => {
    const command = `metaflac --import-picture-from="${coverImagePath}" "${filePath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error adding cover image: ${stderr}`);
        reject(error);
      } else {
        console.log('Cover image added successfully!');
        resolve(stdout);
      }
    });
  });
}

async function setMd5Checksum(filePath) {
  return new Promise((resolve, reject) => {
    const command = `flac -f8 "${filePath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error setting MD5 checksum: ${stderr}`);
        reject(error);
      } else {
        console.log('MD5 checksum set successfully!');
        resolve(stdout);
      }
    });
  });
}

async function downloadImage(url, filepath) {
  if (fs.existsSync(filepath)) {
    console.log(`Cover image already exists at: ${filepath}`);
    return;
  }

  const writer = fs.createWriteStream(filepath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname, { recursive: true });
}

async function tagFile(trackInfo, filePath/*, updateProgress*/) {
  try {
    const { album } = trackInfo;
    const coverUrl = album.coverArtwork.find(artwork => artwork.width === 1280)?.url || album.coverArtwork[0]?.url;
    const fileDir = path.dirname(filePath);
    ensureDirectoryExistence(fileDir);

    const imageName = `${album.title.replace(/[^a-zA-Z0-9]/g, '_')}_cover.jpg`;
    const imagePath = path.join(fileDir, imageName);

    if (coverUrl && !fs.existsSync(imagePath)) {
      //updateProgress(60, `Downloading cover image from: ${coverUrl}`);
      await downloadImage(coverUrl, imagePath);
      //updateProgress(70, `Cover image downloaded to: ${imagePath}`);
    } else {
      //updateProgress(60, `Cover image already exists at: ${imagePath}`);
    }

    let metadataTags = {
      TITLE: trackInfo.title,
      ALBUM: album.title,
      ARTIST: trackInfo.artists.map(artist => artist.name).join(', '),
      GENRE: trackInfo.genres?.join(', ') || '',
      DATE: new Date(album.releaseDate).toISOString().split('T')[0],
      TRACKNUMBER: `${trackInfo.trackNumber}/${album.trackCount}`,
      DISCNUMBER: `${trackInfo.discNumber}/${album.discCount}`,
      COMMENT: trackInfo.comment || '',
      DESCRIPTION: trackInfo.description || '',
      COPYRIGHT: trackInfo.copyright || '',
      ISRC: trackInfo.isrc || '',
      UPC: album.upc || '',
      LABEL: trackInfo.label || '',
      EXPLICIT: trackInfo.explicit ? 'Explicit' : 'Clean',
      PRODUCER: trackInfo.producers?.join(', ') || '',
      COMPOSER: trackInfo.composers?.join(', ') || '',
      LYRICIST: trackInfo.lyricists?.join(', ') || ''
    };
    //console.log(metadataTags)

    metadataTags = Object.fromEntries(Object.entries(metadataTags).filter(([_, v]) => v != null));

    //updateProgress(80, `Adding metadata for ${metadata.title}`);
    await addMetadataToFlac(filePath, metadataTags);
    //updateProgress(85, `Metadata added successfully for ${metadata.title}`);

    if (coverUrl && fs.existsSync(imagePath)) {
      //updateProgress(90, `Adding cover image for ${metadata.title}`);
      await addCoverToFlac(filePath, imagePath);
      //updateProgress(95, `Cover image added successfully for ${metadata.title}`);
    }

    //updateProgress(97, `Setting MD5 checksum for ${metadata.title}`);
    await setMd5Checksum(filePath);
    //updateProgress(99, `MD5 checksum set successfully for ${metadata.title}`);
  } catch (error) {
    //updateProgress(100, `Error in tagFile: ${error.message}`);
    console.log(`Error in tagFile: ${error.message}`);
  }
}

export default tagFile;
