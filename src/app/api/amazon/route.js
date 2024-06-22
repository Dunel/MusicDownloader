import AmazonMusicApi from "@/services/amazon/amazon";
import Downloader from "@/services/amazon/downloader";
import { Codec } from "@/services/amazon/model";
import path from "path";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
      });
    }

    const config = {
      cookiesPath: process.env.COOKIES_PATH || './src/services/amazon/cookies.txt',
      metadataLanguage: process.env.METADATA_LANGUAGE || 'en_US',
      outputPath: process.env.OUTPUT_PATH || './downloads/amazon',
      tempPath: process.env.TEMP_PATH || './downloads/amazon/temp',
      wvdPath: process.env.WVD_PATH || './wvd',
      ffmpegPath: 'ffmpeg',
      mp4boxPath: process.env.MP4BOX_PATH || '/usr/local/bin/MP4Box',
      mp4decryptPath: process.env.MP4DECRYPT_PATH || '/usr/local/bin/mp4decrypt',
      aria2cPath: process.env.ARIA2C_PATH || '/usr/local/bin/aria2c',
      codec: Codec.FLAC_HD,
      codecQuality: 1,
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

    //const amazonMusicApi = new AmazonMusicApi();
    const downloader = new Downloader(config);

    // Obtener información de la URL
    //const urlInfo = downloader.getUrlParts(url);
    const data = await downloader.getByUrl(url);
    
    //const metadata = await amazonMusicApi.getMetadata(urlInfo.asin, urlInfo.country)
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    //console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}
