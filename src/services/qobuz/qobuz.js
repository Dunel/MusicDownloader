import axios from "axios";
import crypto from "crypto";

class Qobuz {
  constructor() {
    this.apiBase = "https://www.qobuz.com/api.json/0.2/";
    this.appId = process.env.QOBUZ_APP_ID;
    this.appSecret = process.env.QOBUZ_APP_SECRET;
    this.authToken = null;
    this.axiosInstance = axios.create();
  }

  getHeaders() {
    return {
      "X-Device-Platform": "android",
      "X-Device-Model": "Pixel 3",
      "X-Device-Os-Version": "10",
      "X-User-Auth-Token": this.authToken || "",
      "X-Device-Manufacturer-Id": "ffffffff-5783-1f51-ffff-ffffef05ac4a",
      "X-App-Version": "5.16.1.5",
      "User-Agent":
        "Dalvik/2.1.0 (Linux; U; Android 10; Pixel 3 Build/QP1A.190711.020)) QobuzMobileAndroid/5.16.1.5-b21041415",
    };
  }

  async request(url, params = {}) {
    try {
      const response = await this.axiosInstance.get(`${this.apiBase}${url}`, {
        params,
        headers: this.getHeaders(),
      });
      if (![200, 201, 202].includes(response.status)) {
        throw new Error(response.data);
      }
      return response.data;
    } catch (error) {
      throw error.response.data;
    }
  }

  createSignature(method, parameters) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let toHash = method.replace("/", "");

    const keys = Object.keys(parameters).sort();
    for (const key of keys) {
      if (key !== "app_id" && key !== "user_auth_token") {
        toHash += key + parameters[key];
      }
    }

    toHash += timestamp + this.appSecret;
    const signature = crypto.createHash("md5").update(toHash).digest("hex");
    return { timestamp, signature };
  }

  async login(email, password) {
    try {
      const params = {
        username: email,
        password: crypto.createHash("md5").update(password).digest("hex"),
        extra: "partner",
        app_id: this.appId,
      };

      const { timestamp, signature } = this.createSignature(
        "user/login",
        params
      );
      params.request_ts = timestamp;
      params.request_sig = signature;

      const response = await this.request("user/login", params);
      if (response.user_auth_token && response.user.credential.parameters) {
        this.authToken = response.user_auth_token;
      } else if (!response.user.credential.parameters) {
        throw new Error("Free accounts are not eligible for downloading");
      } else {
        throw new Error("Invalid username/password");
      }
      return this.authToken;
    } catch (error) {
      console.error("Error in login:", error.message);
      console.error("Stack:", error.stack);
      throw error;
    }
  }

  hashString(str, algorithm) {
    return crypto.createHash(algorithm).update(str).digest("hex");
  }

  async search(queryType, query, limit = 10) {
    return this.request("catalog/search", {
      query: query,
      type: `${queryType}s`,
      limit: limit,
      app_id: this.appId,
    });
  }

  async getFileUrl(trackId, qualityId = 27) {
    const params = {
      track_id: trackId,
      format_id: String(qualityId),
      intent: "stream",
      sample: "false",
      app_id: this.appId,
      user_auth_token: this.authToken,
    };

    const { timestamp, signature } = this.createSignature("track/getFileUrl", params);
    params.request_ts = timestamp;
    params.request_sig = signature;

    return this.request("track/getFileUrl", params);
  }

  async getTrack(trackId) {
    return this.request("track/get", {
      track_id: trackId,
      app_id: this.appId,
    });
  }

  async getPlaylist(playlistId) {
    return this.request("playlist/get", {
      playlist_id: playlistId,
      app_id: this.appId,
      limit: "2000",
      offset: "0",
      extra: "tracks,subscribers,focusAll",
    });
  }

  async getAlbum(albumId) {
    try {
      return this.request("album/get", {
        album_id: albumId,
        app_id: this.appId,
        extra: "albumsFromSameArtist,focusAll",
      });
    } catch (error) {
      console.error(error);
      return
    }
  }

  async getArtist(artistId) {
    return this.request("artist/get", {
      artist_id: artistId,
      app_id: this.appId,
      extra:
        "albums,playlists,tracks_appears_on,albums_with_last_release,focusAll",
      limit: "1000",
      offset: "0",
    });
  }
}

export default Qobuz;
