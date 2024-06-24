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

    const command = commands.join(" && ");
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error adding metadata: ${stderr}`);
        reject(error);
      } else {
        console.log("Metadata added successfully!");
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
        console.log("Cover image added successfully!");
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
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
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

async function tagFile(
  tags,
  coverurl,
  coverPath,
  filePath
) {
  try {
    const coverUrl = coverurl;
    const fileDir = path.dirname(filePath);
    ensureDirectoryExistence(fileDir);

    if (coverUrl && !fs.existsSync(coverPath)) {
      await downloadImage(coverUrl, coverPath);
    }

    let metadataTags = Object.fromEntries(
      Object.entries(tags).filter(([_, v]) => v != null)
    );

    await addMetadataToFlac(filePath, metadataTags);

    if (coverUrl && fs.existsSync(coverPath)) {
      await addCoverToFlac(filePath, coverPath);
    }
  } catch (error) {
    console.log(`Error in tagFile: ${error.message}`);
  }
}

export default tagFile;
