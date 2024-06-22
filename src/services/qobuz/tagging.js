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

  async function tagFile(trackInfo, filePath, updateProgress) {
    try {
      const { tags, cover_url: coverUrl } = trackInfo;
      const fileDir = path.dirname(filePath);
      ensureDirectoryExistence(fileDir);
  
      const imageName = `${trackInfo.album.replace(/[^a-zA-Z0-9]/g, '_')}_cover.jpg`;
      const imagePath = path.join(fileDir, imageName);
  
      if (coverUrl && !fs.existsSync(imagePath)) {
        updateProgress(60, `Downloading cover image from: ${coverUrl}`);
        await downloadImage(coverUrl, imagePath);
        updateProgress(70, `Cover image downloaded to: ${imagePath}`);
      } else {
        updateProgress(60, `Cover image already exists at: ${imagePath}`);
      }
  
      let metadata = {
        TITLE: trackInfo.name,
        ALBUM: trackInfo.album,
        ARTIST: Array.isArray(trackInfo.artists) ? trackInfo.artists.join(', ') : trackInfo.artists,
        GENRE: Array.isArray(tags.genres) ? tags.genres.join(', ') : undefined,
        DATE: tags.release_date,
        TRACKNUMBER: tags.track_number ? `${tags.track_number}/${tags.total_tracks}` : undefined,
        DISCNUMBER: tags.disc_number ? `${tags.disc_number}/${tags.total_discs}` : undefined,
        COMMENT: tags.comment,
        DESCRIPTION: tags.description,
        COPYRIGHT: tags.copyright,
        ISRC: tags.isrc,
        UPC: tags.upc,
        LABEL: tags.label,
        EXPLICIT: trackInfo.explicit ? 'Explicit' : 'Clean',
      };
  
      metadata = Object.fromEntries(Object.entries(metadata).filter(([_, v]) => v != null));
  
      updateProgress(80, `Adding metadata for ${trackInfo.name}`);
      await addMetadataToFlac(filePath, metadata);
      updateProgress(85, `Metadata added successfully for ${trackInfo.name}`);
  
      if (coverUrl && fs.existsSync(imagePath)) {
        updateProgress(90, `Adding cover image for ${trackInfo.name}`);
        await addCoverToFlac(filePath, imagePath);
        updateProgress(95, `Cover image added successfully for ${trackInfo.name}`);
      }
  
      updateProgress(97, `Setting MD5 checksum for ${trackInfo.name}`);
      await setMd5Checksum(filePath);
      updateProgress(99, `MD5 checksum set successfully for ${trackInfo.name}`);
    } catch (error) {
      updateProgress(100, `Error in tagFile: ${error.message}`);
      console.log(`Error in tagFile: ${error.message}`);
    }
  }
  
  
  

export default tagFile;
