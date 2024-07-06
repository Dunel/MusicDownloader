import { exec } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";
import util from "util";
import { Image } from "image-js";

async function addMetadataToFlac(filePath, metadata) {
  try {
    const execPromise = util.promisify(exec);
    const inputFilePath = path.resolve(filePath);
    const tempFilePath = inputFilePath + ".temp.flac";

    const metadataString = Object.entries(metadata)
      .map(
        ([key, value]) =>
          `-metadata ${key.toUpperCase()}="${value.replace(/"/g, '\\"')}"`
      )
      .join(" ");

    const command = `ffmpeg -i "${inputFilePath}" ${metadataString} -codec copy "${tempFilePath}"`;

    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      //console.error(`ffmpeg stderr: ${stderr}`);
    }

    fs.renameSync(tempFilePath, inputFilePath);

  } catch (error) {
    console.error(`Error adding metadata: ${error.message}`);
  }
}

async function addCoverToFlac(filePath, coverImagePath) {
  try {
    const inputFilePath = path.resolve(filePath);
    const tempFilePath = inputFilePath + ".temp.flac";

    const command = `ffmpeg -i "${inputFilePath}" -i "${coverImagePath}" -map 0:a -map 1 -codec copy -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" -disposition:v attached_pic -q:v 1 "${tempFilePath}"`;

    await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          //console.error(`Error adding cover image: ${stderr}`);
          reject(new Error(`Error adding cover image: ${stderr}`));
        } else {
          //console.log("Cover image added successfully!");
          fs.renameSync(tempFilePath, inputFilePath);
          resolve();
        }
      });
    });
  } catch (error) {
    console.error(`Error adding cover: ${error.message}`);
  }
}

async function setMd5Checksum(filePath) {
  try {
    await new Promise((resolve, reject) => {
      const command = `flac -f8 "${filePath}"`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          //console.error(`Error setting MD5 checksum: ${stderr}`);
          reject(error);
        } else {
          //console.log("MD5 checksum set successfully!");
          resolve();
        }
      });
    });
  } catch (error) {
    //console.error(`Error setting MD5 checksum: ${error.message}`);
  }
}

async function downloadImage(url, filepath) {
  try {
    if (fs.existsSync(filepath)) {
      console.log(`Cover image already exists at: ${filepath}`);
      return;
    }

    const writer = fs.createWriteStream(filepath);
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    //console.error(`Error downloading image: ${error.message}`);
  }
}

async function convertToPNG(inputPath, outputPath) {
  try {
    const imageIn = await Image.load(inputPath);
    let imageOut = imageIn.resize({ width: 1000, height: 1000 });
    await imageOut.save(outputPath, { format: "png" });
  } catch (error) {
    //console.error(`Error converting image: ${error.message}`);
  }
}

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname, { recursive: true });
}

async function tagFile(trackInfo, filePath, imagePath) {
  try {
    const { tags, cover_url: coverUrl } = trackInfo;
    const fileDir = path.dirname(filePath);
    ensureDirectoryExistence(fileDir);

    if (coverUrl && !fs.existsSync(imagePath)) {
      await downloadImage(coverUrl, imagePath);
    }

    const pngFilePath = imagePath.replace(/\.[^/.]+$/, ".png");
    await convertToPNG(imagePath, pngFilePath);

    let metadata = {
      TITLE: trackInfo.name,
      ALBUM: trackInfo.album,
      ARTIST: Array.isArray(trackInfo.artists)
        ? trackInfo.artists.join(", ")
        : trackInfo.artists,
      GENRE: Array.isArray(tags.genres) ? tags.genres.join(", ") : undefined,
      DATE: tags.release_date,
      TRACKNUMBER: tags.track_number
        ? `${tags.track_number}/${tags.total_tracks}`
        : undefined,
      DISCNUMBER: tags.disc_number
        ? `${tags.disc_number}/${tags.total_discs}`
        : undefined,
      COMMENT: tags.comment,
      DESCRIPTION: tags.description,
      COPYRIGHT: tags.copyright,
      ISRC: tags.isrc,
      UPC: tags.upc,
      LABEL: tags.label,
      EXPLICIT: trackInfo.explicit ? "Explicit" : "Clean",
    };

    metadata = Object.fromEntries(
      Object.entries(metadata).filter(([_, v]) => v != null)
    );
    await addMetadataToFlac(filePath, metadata);

    if (coverUrl && fs.existsSync(pngFilePath)) {
      await addCoverToFlac(filePath, pngFilePath);
    }
    fs.unlinkSync(pngFilePath);

    await setMd5Checksum(filePath);
  } catch (error) {
    console.log(`Error in tagFile: ${error.message}`);
  }
}

export default tagFile;
